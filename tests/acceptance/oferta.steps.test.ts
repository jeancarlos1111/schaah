import { readdirSync } from 'fs';
import path from 'path';
import { afterAll, expect } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { describeFeature } from '@amiceli/vitest-cucumber';
import { RolUsuario } from '../../src/core/domain/enums';
import { INFO_INCONSISTENCIA } from '../../src/modules/oferta/ofertaInconsistencias';
import type { AnalisisOferta } from '../../src/modules/oferta/services/OfertaImportService';
import { crearBaseTemporal, sembrarPeriodoBase } from '../helpers/baseTemporal';
import { fabrica } from '../helpers/fabrica';
import { RespuestaCapturada, parametroRedireccion, peticion, respuesta } from '../helpers/peticiones';
import { FILAS_REALES, libroComoOferta } from '../oferta/libroOfertaFixture';
import { cargarSpec05 } from './spec05';

const feature = await cargarSpec05();
const base = crearBaseTemporal();
const ids = await sembrarPeriodoBase(base.prisma);
const director = await fabrica(base.prisma).usuario('director.academico@ubv.edu.ve', RolUsuario.DIRECTOR_ACADEMICO);
const { OfertaController } = await import('../../src/modules/oferta/controllers/OfertaController');
const { OfertaImportService } = await import('../../src/modules/oferta/services/OfertaImportService');
const { OfertaInconsistenciasService } = await import('../../src/modules/oferta/services/OfertaInconsistenciasService');
const libro = await libroComoOferta(FILAS_REALES);
afterAll(() => base.cerrar());

async function asegurarOfertaAplicada() {
  if ((await base.prisma.importacionOferta.count()) > 0) return;
  const servicio = new OfertaImportService(base.prisma);
  const { plan } = await servicio.analizarArchivo(libro, ids.periodoId);
  await servicio.aplicarPlan(plan, ids.periodoId, { nombreArchivo: 'OFERTA_2026-II.xlsx', usuarioNombre: 'Dirección Académica' });
}

describeFeature(
  feature,
  ({ Rule }) => {
    Rule('Oferta de carga horaria (Spec 10)', ({ RuleScenario }) => {
      RuleScenario('La importación respalda la base y deja bitácora', ({ Given, When, Then, And }) => {
        const session: Record<string, unknown> = {};
        let nombreArchivo: string;
        let resultado: RespuestaCapturada;
        let respaldo: string;

        Given('un consolidado {string} analizado en vista previa por el director', async (_ctx, archivo: string) => {
          nombreArchivo = archivo;
          const req = await peticion({ usuario: director, params: { id: ids.periodoId }, archivo: { buffer: libro, originalname: archivo }, session });
          const { res, capturada } = respuesta();
          await OfertaController.importar(req, res);
          expect(capturada.redirect).toBe(`/periodos/${ids.periodoId}/oferta/vista-previa`);
          Object.assign(session, req.session);
          expect(await base.prisma.seccion.count()).toBe(0);
        });

        When('el director confirma la importación', async () => {
          const req = await peticion({ usuario: director, params: { id: ids.periodoId }, session });
          const { res, capturada } = respuesta();
          await OfertaController.confirmar(req, res);
          resultado = capturada;
        });

        Then('se crea un respaldo {string} en el directorio de respaldos', (_ctx, sufijo: string) => {
          expect(parametroRedireccion(resultado.redirect, 'error')).toBeNull();
          const respaldos = readdirSync(base.directorioRespaldos);
          expect(respaldos).toHaveLength(1);
          expect(respaldos[0]).toMatch(/^sahad_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-\d{3}_/);
          expect(respaldos[0].endsWith(`_${sufijo}`)).toBe(true);
          expect(parametroRedireccion(resultado.redirect, 'msg')).toContain(`Respaldo previo: ${respaldos[0]}`);
          respaldo = path.join(base.directorioRespaldos, respaldos[0]);
        });

        And('el respaldo no contiene las asignaciones importadas', async () => {
          const copia = new PrismaClient({ datasourceUrl: `file:${respaldo}` });
          try {
            expect(await copia.seccion.count()).toBe(0);
            expect(await copia.periodoAcademico.count()).toBe(1);
          } finally {
            await copia.$disconnect();
          }
        });

        And('la base contiene las {int} asignaciones del consolidado', async (_ctx, cantidad: number) => {
          expect(await base.prisma.seccion.count({ where: { periodoId: ids.periodoId } })).toBe(cantidad);
        });

        And(
          'se registra una importación de {string} a nombre del director con las dedicaciones contradictorias',
          async (_ctx, archivo: string) => {
            expect(archivo).toBe(nombreArchivo);
            const registros = await base.prisma.importacionOferta.findMany();
            expect(registros).toHaveLength(1);
            expect(registros[0]).toMatchObject({ nombreArchivo: archivo, usuarioNombre: `${director.nombres} ${director.apellidos}` });
            expect(JSON.parse(registros[0].dedicacionesInconsistentes)).toEqual([expect.objectContaining({ cedula: 'V-14123456' })]);
          }
        );
      });

      RuleScenario('Reimportar el mismo consolidado no duplica datos', ({ Given, When, Then }) => {
        let resumen: AnalisisOferta['plan']['resumen'];

        Given('que el consolidado ya fue aplicado al período {string}', async (_ctx, codigo: string) => {
          await asegurarOfertaAplicada();
          const periodo = await base.prisma.periodoAcademico.findUniqueOrThrow({ where: { id: ids.periodoId } });
          expect(periodo.codigo).toBe(codigo);
        });

        When('se vuelve a analizar el mismo archivo', async () => {
          ({
            plan: { resumen },
          } = await new OfertaImportService(base.prisma).analizarArchivo(libro, ids.periodoId));
        });

        Then('el plan no propone cohortes, unidades ni asignaciones nuevas', () => {
          expect(resumen).toMatchObject({ programasNuevos: 0, gruposNuevos: 0, unidadesNuevas: 0, asignacionesNuevas: 0 });
          expect(resumen.asignacionesExistentes).toBe(9);
        });
      });

      RuleScenario('Confirmar un código provisional', ({ Given, When, Then, And }) => {
        let unidadId: string;
        let resultado: RespuestaCapturada;

        Given('la unidad {string} con código provisional', async (_ctx, codigo: string) => {
          await asegurarOfertaAplicada();
          const uc = await base.prisma.unidadCurricular.findFirstOrThrow({ where: { codigo } });
          expect(uc.codigoProvisional).toBe(true);
          unidadId = uc.id;
        });

        When('el director guarda el código {string} desde la página de inconsistencias', async (_ctx, codigo: string) => {
          const req = await peticion({ usuario: director, params: { id: ids.periodoId, unidadId }, body: { codigo } });
          const { res, capturada } = respuesta();
          await OfertaController.confirmarCodigoUnidad(req, res);
          resultado = capturada;
        });

        Then('la unidad deja de figurar en {string}', async (_ctx, titulo: string) => {
          expect(parametroRedireccion(resultado.redirect, 'error')).toBeNull();
          expect(INFO_INCONSISTENCIA['codigos-provisionales'].titulo).toBe(titulo);
          const reporte = await new OfertaInconsistenciasService(base.prisma).generarReporte(ids.periodoId);
          expect(reporte.filas['codigos-provisionales'].map((f) => f.id)).not.toContain(unidadId);
          expect(await base.prisma.unidadCurricular.findUniqueOrThrow({ where: { id: unidadId } })).toMatchObject({ codigoProvisional: false });
        });

        And('una nueva importación del consolidado reutiliza la unidad {string} por su nombre', async (_ctx, codigo: string) => {
          const servicio = new OfertaImportService(base.prisma);
          const { plan } = await servicio.analizarArchivo(libro, ids.periodoId);
          const unidadesAntes = await base.prisma.unidadCurricular.count();
          await servicio.aplicarPlan(plan, ids.periodoId, { nombreArchivo: 'OFERTA_2026-II.xlsx', usuarioNombre: 'Dirección Académica' });
          expect(await base.prisma.unidadCurricular.count()).toBe(unidadesAntes);
          const uc = await base.prisma.unidadCurricular.findUniqueOrThrow({ where: { id: unidadId }, include: { secciones: true } });
          expect(uc.codigo).toBe(codigo);
          expect(uc.secciones.length).toBeGreaterThan(0);
          const reporte = await new OfertaInconsistenciasService(base.prisma).generarReporte(ids.periodoId);
          expect(reporte.filas['codigos-provisionales'].map((f) => f.codigo)).not.toContain(codigo);
        });
      });
    });
  },
  { includeTags: ['oferta'] }
);
