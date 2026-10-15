import { afterAll, expect } from 'vitest';
import { describeFeature } from '@amiceli/vitest-cucumber';
import { RolUsuario } from '../../src/core/domain/enums';
import { BLOQUES_HORARIOS_OFICIALES } from '../../src/core/domain/rules/timeSlotUtils';
import { crearBaseTemporal, sembrarPeriodoBase } from '../helpers/baseTemporal';
import { fabrica } from '../helpers/fabrica';
import { RespuestaCapturada, UsuarioSesion, peticion, respuesta } from '../helpers/peticiones';
import { cargarSpec05 } from './spec05';

const feature = await cargarSpec05();
const base = crearBaseTemporal();
const ids = await sembrarPeriodoBase(base.prisma);
const f = fabrica(base.prisma);
const administrador = await f.usuario('admin@ubv.edu.ve', RolUsuario.ADMINISTRADOR);
const { CurriculoController } = await import('../../src/modules/curriculo/controllers/CurriculoController');
const { PeriodosController } = await import('../../src/modules/periodos/controllers/PeriodosController');
const { SolverController } = await import('../../src/modules/solver/controllers/SolverController');
const { OfertaController } = await import('../../src/modules/oferta/controllers/OfertaController');
const { usuariosController } = await import('../../src/modules/usuarios/controllers/UsuariosController');
afterAll(() => base.cerrar());

let coordinador: UsuarioSesion | undefined;
const programas = new Map<string, string>();

async function programa(codigo: string) {
  if (!programas.has(codigo)) {
    const pfg = await base.prisma.programaFormacion.upsert({
      where: { codigo },
      update: {},
      create: { codigo, nombre: `Programa ${codigo}`, areaConocimiento: 'Formación' },
    });
    programas.set(codigo, pfg.id);
  }
  return programas.get(codigo)!;
}

/** Programa con una unidad y su asignación pendiente de 2 horas (un bloque); restablece nombre y código. */
async function programaConPendiente(codigoPrograma: string, codigoUnidad: string, codigoSeccion: string) {
  const pfgId = await programa(codigoPrograma);
  const nombre = `Unidad ${codigoUnidad}`;
  const uc = await base.prisma.unidadCurricular.upsert({
    where: { pfgId_codigo: { pfgId, codigo: codigoUnidad } },
    update: { nombre, codigoProvisional: false },
    create: { pfgId, codigo: codigoUnidad, nombre, trayecto: 1, tramo: 1, creditos: 3, horasTeoricasSemanales: 2 },
  });
  await base.prisma.seccion.upsert({
    where: { periodoId_codigoSeccion: { periodoId: ids.periodoId, codigoSeccion } },
    update: {},
    create: {
      periodoId: ids.periodoId,
      unidadCurricularId: uc.id,
      sedeId: ids.sedeId,
      codigoSeccion,
      cuposEstimados: 30,
      horasSemanalesOferta: 2,
    },
  });
}

async function comoCoordinador(opciones: Omit<Parameters<typeof peticion>[0], 'usuario'>) {
  return peticion({ usuario: coordinador!, ...opciones });
}

async function consultarAsignaciones(): Promise<RespuestaCapturada> {
  const req = await comoCoordinador({ params: { id: ids.periodoId } });
  const { res, capturada } = respuesta();
  await PeriodosController.secciones(req, res);
  expect(capturada.vista).toBe('pages/periodos/secciones');
  return capturada;
}

const unidad = (codigo: string) => base.prisma.unidadCurricular.findFirstOrThrow({ where: { codigo } });
const seccion = (codigo: string) => base.prisma.seccion.findFirstOrThrow({ where: { codigoSeccion: codigo } });

describeFeature(
  feature,
  ({ Rule }) => {
    Rule('Alcance del coordinador por programa (Spec 06)', ({ RuleBackground, RuleScenario }) => {
      RuleBackground(({ Given, And }) => {
        Given('el coordinador {string} asignado solo al programa {string}', async (_ctx, email: string, codigo: string) => {
          expect(codigo).toBe('PFG-INFO');
          programas.set(codigo, ids.pfgId);
          coordinador ??= await f.usuario(email, RolUsuario.COORDINADOR_PFG);
          await base.prisma.usuarioPrograma.deleteMany({ where: { usuarioId: coordinador.id } });
          await base.prisma.usuarioPrograma.create({ data: { usuarioId: coordinador.id, pfgId: ids.pfgId } });
        });

        And(
          'el programa ajeno {string} con la unidad {string} y una asignación pendiente {string}',
          (_ctx, codigoPrograma: string, codigoUnidad: string, codigoSeccion: string) =>
            programaConPendiente(codigoPrograma, codigoUnidad, codigoSeccion)
        );

        And(
          'el programa {string} con la unidad {string} y una asignación pendiente {string}',
          (_ctx, codigoPrograma: string, codigoUnidad: string, codigoSeccion: string) =>
            programaConPendiente(codigoPrograma, codigoUnidad, codigoSeccion)
        );
      });

      RuleScenario('El coordinador no puede editar una unidad de otro programa', ({ When, Then, And }) => {
        let resultado: RespuestaCapturada;
        let nombreOriginal: string;

        When('el coordinador intenta renombrar la unidad {string}', async (_ctx, codigo: string) => {
          const uc = await unidad(codigo);
          nombreOriginal = uc.nombre;
          const req = await comoCoordinador({
            params: { id: uc.id },
            body: {
              codigo: uc.codigo,
              nombre: 'Nombre cambiado por otro programa',
              trayecto: '1',
              tramo: '1',
              creditos: '3',
              horasTeoricasSemanales: '2',
              horasPracticasSemanales: '0',
              horasCampoComunitarioSemanales: '0',
              tipoEspacioRequerido: 'AULA_TEORICA',
            },
          });
          const { res, capturada } = respuesta();
          await CurriculoController.editarUnidad(req, res);
          resultado = capturada;
        });

        Then('el servidor responde {int}', (_ctx, codigo: number) => {
          expect(resultado.status).toBe(codigo);
          expect(resultado.vista).toBe('pages/error');
        });

        And('la unidad {string} conserva su nombre', async (_ctx, codigo: string) => {
          expect((await unidad(codigo)).nombre).toBe(nombreOriginal);
        });
      });

      RuleScenario('El listado de asignaciones muestra solo sus programas', ({ When, Then, And }) => {
        let resultado: RespuestaCapturada;

        When('el coordinador consulta las asignaciones del período', async () => {
          resultado = await consultarAsignaciones();
        });

        Then('solo aparece la asignación {string}', async (_ctx, codigo: string) => {
          expect(resultado.locals.secciones.map((s: { codigoSeccion: string }) => s.codigoSeccion)).toEqual([codigo]);
          expect(resultado.locals.stats.totalSecciones).toBe(1);

          const req = await comoCoordinador({ params: { id: ids.periodoId }, query: { pfgId: await programa('PFG-ARQ') } });
          const { res, capturada } = respuesta();
          await PeriodosController.secciones(req, res);
          expect(capturada.locals.secciones.map((s: { codigoSeccion: string }) => s.codigoSeccion)).toEqual([codigo]);
        });

        And('el filtro de programas solo ofrece {string}', (_ctx, codigo: string) => {
          expect(resultado.locals.pfgs.map((p: { codigo: string }) => p.codigo)).toEqual([codigo]);
        });
      });

      RuleScenario('El solver programa solo sus pendientes y respeta los horarios de otros programas', ({ Given, And, When, Then }) => {
        let aulaId: string;
        let resultado: RespuestaCapturada;

        Given(
          'que {string} ya ocupa el aula {string} el {string} de {string} a {string}',
          async (_ctx, codigo: string, aula: string, dia: string, inicio: string, fin: string) => {
            aulaId = (await f.aula(ids.sedeId, aula, 40, aula)).id;
            await base.prisma.horarioSeccion.create({
              data: { seccionId: (await seccion(codigo)).id, espacioFisicoId: aulaId, dia, horaInicio: inicio, horaFin: fin },
            });
          }
        );

        And(
          '{string} solo puede dictarse el {string} a las {string} o a las {string}',
          async (_ctx, codigo: string, dia: string, ...horas: string[]) => {
            const profesor = await f.profesor('Pedro Silva');
            await base.prisma.seccion.update({ where: { id: (await seccion(codigo)).id }, data: { profesorId: profesor.id } });
            for (const hora of horas.filter((h) => typeof h === 'string')) {
              const oficial = BLOQUES_HORARIOS_OFICIALES.find((b) => b.horaInicio === hora)!;
              await base.prisma.profesorDisponibilidad.create({
                data: { profesorId: profesor.id, periodoId: ids.periodoId, dia, horaInicio: hora, horaFin: oficial.horaFin },
              });
            }
          }
        );

        When('el coordinador ejecuta el motor genético', async () => {
          const req = await comoCoordinador({
            json: true,
            params: { id: ids.periodoId },
            body: { motor: 'GENETICO', tamanoPoblacion: 8, maxGeneraciones: 10 },
          });
          const { res, capturada } = respuesta();
          await SolverController.ejecutar(req, res);
          resultado = capturada;
        });

        Then('la propuesta solo incluye bloques de {string}', async (_ctx, codigo: string) => {
          expect(resultado.json.ok).toBe(true);
          const { id } = await seccion(codigo);
          expect(resultado.json.resultado.asignaciones.map((a: { seccionId: string }) => a.seccionId)).toEqual([id]);
          expect(resultado.json.resultado.violacionesDuras).toEqual([]);
        });

        And('{string} queda el {string} a las {string} en el aula {string}', (_ctx, _codigo: string, dia: string, hora: string, aula: string) => {
          const [bloque] = resultado.json.resultado.asignaciones;
          expect(bloque).toMatchObject({ dia, horaInicio: hora, espacioFisicoId: aulaId, codigoEspacio: aula });
        });

        And('aplicar una propuesta que incluya {string} se rechaza por estar fuera de su alcance', async (_ctx, codigo: string) => {
          const ajena = { ...resultado.json.resultado.asignaciones[0], seccionId: (await seccion(codigo)).id, dia: 'MARTES' };
          const req = await comoCoordinador({
            json: true,
            params: { id: ids.periodoId },
            body: { propuesta: { asignaciones: [...resultado.json.resultado.asignaciones, ajena] } },
          });
          const { res, capturada } = respuesta();
          await SolverController.aplicar(req, res);
          expect(capturada.status).toBe(403);
          expect(capturada.json.error).toContain('programas que usted coordina');
          expect(await base.prisma.horarioSeccion.count()).toBe(1);
        });
      });

      RuleScenario('Confirmar el código de una unidad de otro programa es rechazado', ({ Given, When, Then, And }) => {
        let resultado: RespuestaCapturada;
        let unidadId: string;

        Given('la unidad {string} marcada con código provisional', async (_ctx, codigo: string) => {
          unidadId = (await base.prisma.unidadCurricular.update({ where: { id: (await unidad(codigo)).id }, data: { codigoProvisional: true } })).id;
        });

        When('el coordinador intenta confirmar el código {string}', async (_ctx, codigo: string) => {
          const req = await comoCoordinador({ params: { id: ids.periodoId, unidadId }, body: { codigo } });
          const { res, capturada } = respuesta();
          await OfertaController.confirmarCodigoUnidad(req, res);
          resultado = capturada;
        });

        Then('el servidor responde {int}', (_ctx, codigo: number) => {
          expect(resultado.status).toBe(codigo);
          expect(resultado.vista).toBe('pages/error');
        });

        And('la unidad {string} sigue con código provisional', async (_ctx, codigo: string) => {
          expect(await base.prisma.unidadCurricular.findUniqueOrThrow({ where: { id: unidadId } })).toMatchObject({
            codigo,
            codigoProvisional: true,
          });
        });
      });

      RuleScenario('Un programa asignado por el administrador aplica sin volver a iniciar sesión', ({ When, And, Then }) => {
        let resultado: RespuestaCapturada;

        When('el administrador asigna también el programa {string} al coordinador', async (_ctx, codigo: string) => {
          const req = await peticion({
            usuario: administrador,
            params: { id: coordinador!.id },
            body: {
              nombres: coordinador!.nombres,
              apellidos: coordinador!.apellidos,
              rol: RolUsuario.COORDINADOR_PFG,
              programas: [ids.pfgId, await programa(codigo)],
            },
          });
          const { res, capturada } = respuesta();
          await usuariosController.editar(req, res);
          expect(capturada.redirect).toContain('success=');
        });

        And('el coordinador vuelve a consultar las asignaciones del período', async () => {
          resultado = await consultarAsignaciones();
        });

        Then('aparecen las asignaciones {string} e {string}', (_ctx, primera: string, segunda: string) => {
          const codigos = resultado.locals.secciones.map((s: { codigoSeccion: string }) => s.codigoSeccion).sort();
          expect(codigos).toEqual([primera, segunda].sort());
          expect(resultado.locals.pfgs.map((p: { codigo: string }) => p.codigo).sort()).toEqual(['PFG-ARQ', 'PFG-INFO']);
        });
      });
    });
  },
  { includeTags: ['coordinador'] }
);
