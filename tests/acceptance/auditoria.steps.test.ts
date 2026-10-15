import { afterAll, expect } from 'vitest';
import { describeFeature } from '@amiceli/vitest-cucumber';
import { RolUsuario } from '../../src/core/domain/enums';
import { crearBaseTemporal, sembrarPeriodoBase } from '../helpers/baseTemporal';
import { fabrica } from '../helpers/fabrica';
import { RespuestaCapturada, peticion, respuesta } from '../helpers/peticiones';
import { cargarSpec05 } from './spec05';

const feature = await cargarSpec05();
const base = crearBaseTemporal();
const ids = await sembrarPeriodoBase(base.prisma);
const f = fabrica(base.prisma);
const { HorariosController } = await import('../../src/modules/horarios/controllers/HorariosController');
afterAll(() => base.cerrar());

describeFeature(
  feature,
  ({ Rule }) => {
    Rule('Auditoría de ajustes manuales', ({ RuleScenario }) => {
      RuleScenario('Registro estricto de trazabilidad al modificar un horario', ({ Given, When, Then, And }) => {
        let seccionId: string;
        let horarioId: string;
        let aulaId: string;
        let resultado: RespuestaCapturada;

        Given('un horario de la sección {string} el {string} de {string} a {string}', async (_ctx, codigo: string, dia: string, inicio: string, fin: string) => {
          const uc = await f.unidad(ids.pfgId, 'BD-II', 'Bases de Datos II');
          seccionId = (await f.seccion({ periodoId: ids.periodoId, unidadId: uc.id, sedeId: ids.sedeId, codigo })).id;
          aulaId = (await f.aula(ids.sedeId, 'Aula 201', 40)).id;
          horarioId = (
            await base.prisma.horarioSeccion.create({
              data: { seccionId, espacioFisicoId: aulaId, dia, horaInicio: inicio, horaFin: fin },
            })
          ).id;
        });

        When(
          'el usuario {string} mueve la sección {string} al {string} de {string} a {string} con la justificación {string}',
          async (_ctx, email: string, _codigo: string, dia: string, inicio: string, fin: string, justificacion: string) => {
            const usuario = await f.usuario(email, RolUsuario.COORDINADOR_PFG, [ids.pfgId]);
            const req = await peticion({
              usuario,
              json: true,
              params: { id: ids.periodoId },
              body: { seccionId, horarioId, dia, horaInicio: inicio, horaFin: fin, espacioFisicoId: aulaId, justificacion },
            });
            const { res, capturada } = respuesta();
            await HorariosController.moverBloque(req, res);
            resultado = capturada;
          }
        );

        Then('se crea un registro de auditoría de tipo {string}', async (_ctx, tipo: string) => {
          expect(resultado.json.success).toBe(true);
          const registros = await base.prisma.auditoriaAjusteHorario.findMany({ where: { seccionId } });
          expect(registros.map((r) => r.tipoOperacion)).toEqual([tipo]);
          expect(registros[0].horarioSeccionId).toBe(horarioId);
        });

        And(
          'los datos anteriores registran {string} a las {string} y los nuevos {string} a las {string}',
          async (_ctx, diaAntes: string, horaAntes: string, diaDespues: string, horaDespues: string) => {
            const registro = await base.prisma.auditoriaAjusteHorario.findFirstOrThrow({ where: { seccionId } });
            expect(JSON.parse(registro.datosAnteriores!)).toMatchObject({ dia: diaAntes, horaInicio: horaAntes });
            expect(JSON.parse(registro.datosNuevos!)).toMatchObject({ dia: diaDespues, horaInicio: horaDespues });
            expect(await base.prisma.horarioSeccion.findUniqueOrThrow({ where: { id: horarioId } })).toMatchObject({
              dia: diaDespues,
              horaInicio: horaDespues,
            });
          }
        );

        And(
          'el usuario responsable queda registrado como {string} con la justificación {string}',
          async (_ctx, email: string, justificacion: string) => {
            const registro = await base.prisma.auditoriaAjusteHorario.findFirstOrThrow({ where: { seccionId } });
            expect(registro.usuarioResponsable).toBe(email);
            expect(registro.justificacionResolucion).toBe(justificacion);
          }
        );
      });
    });
  },
  { includeTags: ['auditoria'] }
);
