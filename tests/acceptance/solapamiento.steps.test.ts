import { afterAll, expect } from 'vitest';
import { describeFeature } from '@amiceli/vitest-cucumber';
import { RolUsuario } from '../../src/core/domain/enums';
import { BloqueHorarioExistente } from '../../src/core/domain/rules/horarioConflictRules';
import { ResultadoValidacionHorario, validarAsignacionHoraria } from '../../src/core/domain/rules/validadorHorarioService';
import { evaluarSolucion } from '../../src/modules/solver/evaluator';
import { GeneticSolverEngine } from '../../src/modules/solver/geneticEngine';
import { SolverInput } from '../../src/modules/solver/types';
import { crearBaseTemporal, sembrarPeriodoBase } from '../helpers/baseTemporal';
import { fabrica } from '../helpers/fabrica';
import { RespuestaCapturada, peticion, respuesta } from '../helpers/peticiones';
import { propuestaBloque, seccionSolver } from '../helpers/solver';
import { cargarSpec05 } from './spec05';

const feature = await cargarSpec05();
const base = crearBaseTemporal();
const ids = await sembrarPeriodoBase(base.prisma);
const coordinador = await fabrica(base.prisma).usuario('coord.informatica@ubv.edu.ve', RolUsuario.COORDINADOR_PFG, [ids.pfgId]);
const { HorariosController } = await import('../../src/modules/horarios/controllers/HorariosController');
afterAll(() => base.cerrar());

describeFeature(
  feature,
  ({ Rule }) => {
    Rule('Exclusión física y anti-solapamiento (H-01, H-02, H-03)', ({ RuleScenario }) => {
      RuleScenario('Dos secciones no pueden ocupar la misma aula a la misma hora', ({ Given, And, When, Then }) => {
        const aulas = new Map<string, { id: string; codigo: string; capacidad: number }>();
        const secciones = new Map<string, string>();
        let resultado: RespuestaCapturada;

        const seccion = async (codigo: string) => {
          if (!secciones.has(codigo)) {
            const f = fabrica(base.prisma);
            const uc = await f.unidad(ids.pfgId, `UC-${codigo}`, `Unidad ${codigo}`);
            const s = await f.seccion({ periodoId: ids.periodoId, unidadId: uc.id, sedeId: ids.sedeId, codigo });
            secciones.set(codigo, s.id);
          }
          return secciones.get(codigo)!;
        };

        Given('el aula {string} con capacidad para {int} estudiantes', async (_ctx, nombre: string, capacidad: number) => {
          const aula = await fabrica(base.prisma).aula(ids.sedeId, nombre, capacidad);
          aulas.set(nombre, aula);
        });

        And(
          'la sección {string} programada el {string} de {string} a {string} en {string}',
          async (_ctx, codigo: string, dia: string, inicio: string, fin: string, aula: string) => {
            await base.prisma.horarioSeccion.create({
              data: { seccionId: await seccion(codigo), espacioFisicoId: aulas.get(aula)!.id, dia, horaInicio: inicio, horaFin: fin },
            });
          }
        );

        When(
          'el coordinador mueve la sección {string} al {string} de {string} a {string} en {string}',
          async (_ctx, codigo: string, dia: string, inicio: string, fin: string, aula: string) => {
            const req = await peticion({
              usuario: coordinador,
              json: true,
              params: { id: ids.periodoId },
              body: { seccionId: await seccion(codigo), dia, horaInicio: inicio, horaFin: fin, espacioFisicoId: aulas.get(aula)!.id },
            });
            const { res, capturada } = respuesta();
            await HorariosController.moverBloque(req, res);
            resultado = capturada;
          }
        );

        Then('el servidor responde {int} citando la restricción {string}', (_ctx, codigo: number, regla: string) => {
          expect(resultado.status).toBe(codigo);
          expect(resultado.json.success).toBe(false);
          expect(resultado.json.conflictos.map((c: { codigoRegla: string }) => c.codigoRegla)).toContain(regla);
          expect(resultado.json.error).toContain(`Conflicto ${regla}`);
        });

        And('la sección {string} no queda programada', async (_ctx, codigo: string) => {
          expect(await base.prisma.horarioSeccion.count({ where: { seccionId: secciones.get(codigo) } })).toBe(0);
          expect(await base.prisma.auditoriaAjusteHorario.count({ where: { seccionId: secciones.get(codigo) } })).toBe(0);
        });

        And('el evaluador del motor marca {string} para esa combinación', async (_ctx, regla: string) => {
          const ocupado = await base.prisma.horarioSeccion.findFirstOrThrow({ include: { seccion: true, espacioFisico: true } });
          const aula = ocupado.espacioFisico!;
          const input: SolverInput = {
            periodoId: ids.periodoId,
            seccionesPendientes: [seccionSolver({ id: secciones.get('EST-T1-B')!, sedeId: ids.sedeId })],
            docentes: new Map(),
            espacios: [
              { id: aula.id, codigo: aula.codigo, nombre: aula.nombre, tipo: aula.tipo, capacidad: aula.capacidad, sedeId: aula.sedeId, activa: true },
            ],
            horariosExistentes: [
              {
                id: ocupado.id,
                seccionId: ocupado.seccionId,
                grupoId: null,
                espacioFisicoId: aula.id,
                sedeId: ids.sedeId,
                dia: ocupado.dia,
                horaInicio: ocupado.horaInicio,
                horaFin: ocupado.horaFin,
              },
            ],
          };
          const evaluacion = evaluarSolucion(
            [
              propuestaBloque({
                seccionId: secciones.get('EST-T1-B')!,
                dia: ocupado.dia,
                horaInicio: ocupado.horaInicio,
                espacioFisicoId: aula.id,
                sedeId: ids.sedeId,
              }),
            ],
            input
          );
          expect(evaluacion.esFactible).toBe(false);
          expect(evaluacion.violacionesDuras.map((v) => v.codigoRegla)).toEqual([regla]);
        });
      });

      RuleScenario('Los estudiantes de una misma cohorte no pueden tener dos materias a la vez', ({ Given, And, When, Then, But }) => {
        let grupo: string;
        const bloques: BloqueHorarioExistente[] = [];
        let propuesta: Parameters<typeof validarAsignacionHoraria>[0];
        let resultado: ResultadoValidacionHorario;

        Given('la cohorte {string} con las asignaciones {string} y {string}', (_ctx, cohorte: string) => {
          grupo = cohorte;
        });

        And('{string} programada el {string} de {string} a {string}', (_ctx, materia: string, dia: string, inicio: string, fin: string) => {
          bloques.push({
            id: 'h-matematica',
            seccionId: 'asig-matematica',
            grupoId: `grupo-${grupo}`,
            grupoCodigo: grupo,
            unidadCurricularNombre: materia,
            codigoSeccion: `${grupo}-MAT`,
            espacioFisicoId: 'aula-1',
            dia,
            horaInicio: inicio,
            horaFin: fin,
          });
        });

        When('se intenta programar {string} el {string} de {string} a {string}', (_ctx, _materia: string, dia: string, inicio: string, fin: string) => {
          propuesta = {
            seccionId: 'asig-lenguaje',
            grupoId: `grupo-${grupo}`,
            espacioFisicoId: 'aula-2',
            dia,
            horaInicio: inicio,
            horaFin: fin,
          };
          resultado = validarAsignacionHoraria(propuesta, bloques);
        });

        Then('el validador rechaza el movimiento por la restricción {string} indicando el grupo {string}', (_ctx, regla: string, cohorte: string) => {
          expect(resultado.esValido).toBe(false);
          expect(resultado.conflictos.map((c) => c.codigoRegla)).toEqual([regla]);
          expect(resultado.conflictos[0].mensaje).toContain(cohorte);
          expect(resultado.conflictos[0].mensaje).toContain('Matemática');
        });

        But('una asignación de la cohorte {string} sí puede ocupar ese mismo horario', (_ctx, otraCohorte: string) => {
          const r = validarAsignacionHoraria({ ...propuesta, seccionId: 'asig-lenguaje-b', grupoId: `grupo-${otraCohorte}` }, bloques);
          expect(r.esValido).toBe(true);
        });
      });

      RuleScenario('Un profesor no puede tener clases simultáneas', ({ Given, And, When, Then }) => {
        const profesorId = 'prof-jesus';
        let input: SolverInput;
        let evaluacionConflicto: ReturnType<typeof evaluarSolucion>;
        let codigoPendiente: string;

        Given(
          'el profesor {string} con la sección {string} programada el {string} de {string} a {string}',
          (_ctx, nombre: string, codigo: string, dia: string, inicio: string, fin: string) => {
            input = {
              periodoId: 'p',
              seccionesPendientes: [],
              docentes: new Map([[profesorId, { id: profesorId, cedula: 'V-1', nombreCompleto: nombre, disponibilidades: [] }]]),
              espacios: [
                { id: 'aula-1', codigo: 'A1', nombre: 'Aula 1', tipo: 'AULA_TEORICA', capacidad: 40, sedeId: 'sede', activa: true },
                { id: 'aula-2', codigo: 'A2', nombre: 'Aula 2', tipo: 'AULA_TEORICA', capacidad: 40, sedeId: 'sede', activa: true },
              ],
              horariosExistentes: [
                { id: `h-${codigo}`, seccionId: codigo, profesorId, espacioFisicoId: 'aula-1', sedeId: 'sede', dia, horaInicio: inicio, horaFin: fin },
              ],
            };
          }
        );

        And(
          '{string} solo está disponible el {string} de {string} a {string} y de {string} a {string}',
          (_ctx, _nombre: string, dia: string, i1: string, f1: string, i2: string, f2: string) => {
            input.docentes.get(profesorId)!.disponibilidades = [
              { dia, horaInicio: i2, horaFin: f2, disponible: true, prioridadPreferencia: 1 },
              { dia, horaInicio: i1, horaFin: f1, disponible: true, prioridadPreferencia: 1 },
            ];
          }
        );

        When('se evalúa programar su sección {string} el {string} de {string} a {string}', (_ctx, codigo: string, dia: string, inicio: string) => {
          codigoPendiente = codigo;
          input.seccionesPendientes = [seccionSolver({ id: codigo, codigoSeccion: codigo, profesorId })];
          evaluacionConflicto = evaluarSolucion(
            [propuestaBloque({ seccionId: codigo, dia, horaInicio: inicio, profesorId, espacioFisicoId: 'aula-2' })],
            input
          );
        });

        Then('el evaluador descarta la combinación por la restricción {string}', (_ctx, regla: string) => {
          expect(evaluacionConflicto.esFactible).toBe(false);
          expect(evaluacionConflicto.violacionesDuras.map((v) => v.codigoRegla)).toEqual([regla]);
        });

        And('el motor genético programa {string} el {string} a las {string}', (_ctx, codigo: string, dia: string, hora: string) => {
          expect(codigo).toBe(codigoPendiente);
          const resultado = new GeneticSolverEngine(input, { maxGeneraciones: 10, tamanoPoblacion: 6 }).resolver();
          expect(resultado.violacionesDuras).toEqual([]);
          expect(resultado.asignaciones.map((a) => `${a.seccionId} ${a.dia} ${a.horaInicio}`)).toEqual([`${codigo} ${dia} ${hora}`]);
        });
      });
    });
  },
  { includeTags: ['solapamiento'] }
);
