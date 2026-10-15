import { afterAll, expect } from 'vitest';
import { describeFeature } from '@amiceli/vitest-cucumber';
import { RolUsuario } from '../../src/core/domain/enums';
import { crearBaseTemporal, sembrarPeriodoBase } from '../helpers/baseTemporal';
import { fabrica } from '../helpers/fabrica';
import { RespuestaCapturada, parametroRedireccion, peticion, respuesta } from '../helpers/peticiones';
import { cargarSpec05 } from './spec05';

const feature = await cargarSpec05();
const base = crearBaseTemporal();
const ids = await sembrarPeriodoBase(base.prisma);
const f = fabrica(base.prisma);
const coordinador = await f.usuario('coord.mallas@ubv.edu.ve', RolUsuario.COORDINADOR_PFG, [ids.pfgId]);
const { CurriculoController } = await import('../../src/modules/curriculo/controllers/CurriculoController');
afterAll(() => base.cerrar());

async function programaCoordinado(codigo: string, tipo: string) {
  const pfg = await base.prisma.programaFormacion.create({
    data: { codigo, nombre: `Programa ${codigo}`, tipo, areaConocimiento: 'Formación' },
  });
  await base.prisma.usuarioPrograma.create({ data: { usuarioId: coordinador.id, pfgId: pfg.id } });
  return pfg;
}

async function unidadPorCodigo(codigo: string) {
  return base.prisma.unidadCurricular.findFirstOrThrow({ where: { codigo } });
}

/** Envía el formulario de edición de la malla con los valores actuales de la unidad y los cambios indicados. */
async function editarUnidad(codigo: string, cambios: Record<string, string>): Promise<RespuestaCapturada> {
  const uc = await unidadPorCodigo(codigo);
  const req = await peticion({
    usuario: coordinador,
    params: { id: uc.id },
    body: {
      codigo: uc.codigo,
      nombre: uc.nombre,
      trayecto: uc.trayecto === null ? '' : String(uc.trayecto),
      tramo: uc.tramo === null ? '' : String(uc.tramo),
      creditos: String(uc.creditos),
      horasTeoricasSemanales: String(uc.horasTeoricasSemanales),
      horasPracticasSemanales: String(uc.horasPracticasSemanales),
      horasCampoComunitarioSemanales: String(uc.horasCampoComunitarioSemanales),
      tipoEspacioRequerido: uc.tipoEspacioRequerido,
      ...cambios,
    },
  });
  const { res, capturada } = respuesta();
  await CurriculoController.editarUnidad(req, res);
  return capturada;
}

/** Deja INF-301 (requiere a INF-101) en la ubicación indicada; idempotente entre escenarios. */
async function mallaConPrelacion(codigo: string, trayecto: number, tramo: number, requisito: string, trayectoReq: number, tramoReq: number) {
  const ubicar = (cod: string, t: number, tr: number) =>
    base.prisma.unidadCurricular.upsert({
      where: { pfgId_codigo: { pfgId: ids.pfgId, codigo: cod } },
      update: { trayecto: t, tramo: tr },
      create: { pfgId: ids.pfgId, codigo: cod, nombre: `Unidad ${cod}`, trayecto: t, tramo: tr, creditos: 3, horasTeoricasSemanales: 2, horasPracticasSemanales: 2 },
    });
  const req = await ubicar(requisito, trayectoReq, tramoReq);
  const uc = await ubicar(codigo, trayecto, tramo);
  await base.prisma.unidadCurricularPrelacion.upsert({
    where: { unidadCurricularId_preladaPorId: { unidadCurricularId: uc.id, preladaPorId: req.id } },
    create: { unidadCurricularId: uc.id, preladaPorId: req.id },
    update: {},
  });
}

describeFeature(
  feature,
  ({ Rule }) => {
    Rule('Mallas curriculares (RC-06, RC-07)', ({ RuleScenario }) => {
      RuleScenario('Una unidad de un programa PFA se guarda sin trayecto ni tramo', ({ Given, When, Then }) => {
        let resultado: RespuestaCapturada;

        Given(
          'el programa {string} de tipo {string} con la unidad {string} en el Trayecto {int}, Tramo {int}',
          async (_ctx, codigoPrograma: string, tipo: string, codigo: string, trayecto: number, tramo: number) => {
            const pfg = await programaCoordinado(codigoPrograma, tipo);
            await f.unidad(pfg.id, codigo, 'Curso de formación avanzada', { trayecto, tramo });
          }
        );

        When('el coordinador edita la unidad {string} dejando Trayecto y Tramo vacíos', async (_ctx, codigo: string) => {
          resultado = await editarUnidad(codigo, { trayecto: '', tramo: '' });
        });

        Then('la unidad {string} queda sin trayecto ni tramo', async (_ctx, codigo: string) => {
          expect(parametroRedireccion(resultado.redirect, 'error')).toBeNull();
          expect(parametroRedireccion(resultado.redirect, 'msg')).toContain(codigo);
          expect(await unidadPorCodigo(codigo)).toMatchObject({ trayecto: null, tramo: null });
        });
      });

      RuleScenario('Una unidad de un PFG exige trayecto y tramo', ({ Given, When, Then, And }) => {
        let resultado: RespuestaCapturada;

        Given('la unidad {string} del PFG {string} importada sin trayecto desde la oferta', async (_ctx, codigo: string, codigoPfg: string) => {
          const pfg = await programaCoordinado(codigoPfg, 'PFG');
          await f.unidad(pfg.id, codigo, 'Diseño Arquitectónico', { trayecto: null, tramo: null });
        });

        When('el coordinador guarda la unidad {string} sin trayecto ni tramo', async (_ctx, codigo: string) => {
          resultado = await editarUnidad(codigo, { trayecto: '', tramo: '', nombre: 'Diseño Arquitectónico VI' });
        });

        Then('el sistema responde con un error que contiene {string}', (_ctx, texto: string) => {
          expect(parametroRedireccion(resultado.redirect, 'error')).toContain(texto);
        });

        And('la unidad {string} sigue sin trayecto', async (_ctx, codigo: string) => {
          expect(await unidadPorCodigo(codigo)).toMatchObject({ trayecto: null, tramo: null, nombre: 'Diseño Arquitectónico' });
        });
      });

      RuleScenario('Editar una unidad conserva sus prelaciones', ({ Given, When, Then }) => {
        Given(
          'la unidad {string} en el Trayecto {int}, Tramo {int} prelada por {string} en el Trayecto {int}, Tramo {int}',
          (_ctx, codigo: string, trayecto: number, tramo: number, requisito: string, trayectoReq: number, tramoReq: number) =>
            mallaConPrelacion(codigo, trayecto, tramo, requisito, trayectoReq, tramoReq)
        );

        When('se edita el nombre de {string} desde un formulario que no envía el selector de prelaciones', async (_ctx, codigo: string) => {
          const r = await editarUnidad(codigo, { nombre: 'Ingeniería del Software' });
          expect(parametroRedireccion(r.redirect, 'error')).toBeNull();
          expect((await unidadPorCodigo(codigo)).nombre).toBe('Ingeniería del Software');
        });

        Then('{string} sigue siendo prelación de {string}', async (_ctx, requisito: string, codigo: string) => {
          const uc = await base.prisma.unidadCurricular.findFirstOrThrow({
            where: { codigo },
            include: { prelacionesRequeridas: { include: { preladaPor: true } } },
          });
          expect(uc.prelacionesRequeridas.map((p) => p.preladaPor.codigo)).toEqual([requisito]);
        });
      });

      RuleScenario('No se puede mover un requisito después de la unidad que lo necesita', ({ Given, When, Then, And }) => {
        let resultado: RespuestaCapturada;

        Given(
          'la unidad {string} en el Trayecto {int}, Tramo {int} prelada por {string} en el Trayecto {int}, Tramo {int}',
          (_ctx, codigo: string, trayecto: number, tramo: number, requisito: string, trayectoReq: number, tramoReq: number) =>
            mallaConPrelacion(codigo, trayecto, tramo, requisito, trayectoReq, tramoReq)
        );

        When('se intenta mover {string} al Trayecto {int}, Tramo {int}', async (_ctx, codigo: string, trayecto: number, tramo: number) => {
          resultado = await editarUnidad(codigo, { trayecto: String(trayecto), tramo: String(tramo) });
        });

        Then('el sistema responde con un error que contiene {string}', (_ctx, texto: string) => {
          expect(parametroRedireccion(resultado.redirect, 'error')).toContain(texto);
        });

        And('el error menciona {string}', (_ctx, codigo: string) => {
          expect(parametroRedireccion(resultado.redirect, 'error')).toContain(codigo);
        });

        And('{string} sigue en el Trayecto {int}, Tramo {int}', async (_ctx, codigo: string, trayecto: number, tramo: number) => {
          expect(await unidadPorCodigo(codigo)).toMatchObject({ trayecto, tramo });
        });
      });
    });
  },
  { includeTags: ['mallas'] }
);
