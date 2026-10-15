import { afterAll, expect } from 'vitest';
import { describeFeature } from '@amiceli/vitest-cucumber';
import { DedicacionDocente, RolUsuario, Turno } from '../../src/core/domain/enums';
import { LIMITES_DEDICACION, calcularCargaDocente } from '../../src/core/domain/rules/dedicacionRules';
import {
  BLOQUES_HORARIOS_OFICIALES,
  diasPorTurno,
  indicesBloquesPorTurno,
  timeToMinutes,
} from '../../src/core/domain/rules/timeSlotUtils';
import { evaluarSolucion } from '../../src/modules/solver/evaluator';
import { GeneticSolverEngine } from '../../src/modules/solver/geneticEngine';
import { SolverInput, SolverResult } from '../../src/modules/solver/types';
import { crearBaseTemporal, sembrarPeriodoBase } from '../helpers/baseTemporal';
import { fabrica } from '../helpers/fabrica';
import { RespuestaCapturada, parametroRedireccion, peticion, respuesta } from '../helpers/peticiones';
import { seccionSolver } from '../helpers/solver';
import { cargarSpec05 } from './spec05';

const feature = await cargarSpec05();
const base = crearBaseTemporal();
const ids = await sembrarPeriodoBase(base.prisma);
const f = fabrica(base.prisma);
const coordinador = await f.usuario('coord.informatica@ubv.edu.ve', RolUsuario.COORDINADOR_PFG, [ids.pfgId]);
const { PeriodosController } = await import('../../src/modules/periodos/controllers/PeriodosController');
afterAll(() => base.cerrar());

describeFeature(
  feature,
  ({ Rule }) => {
    Rule('Límites legales de dedicación docente (H-04, H-05)', ({ RuleScenario }) => {
      RuleScenario('El motor distribuye la carga de un docente a Dedicación Exclusiva dentro de la norma', ({ Given, And, When, Then }) => {
        const profesorId = 'prof-carlos';
        let dedicacion: string;
        let horasPorSeccion: number;
        let input: SolverInput;
        let resultado: SolverResult;

        Given(
          'un profesor {string} con dedicación {string} disponible en los bloques oficiales del turno matutino',
          (_ctx, nombre: string, tipo: string) => {
            dedicacion = tipo;
            const disponibilidades = diasPorTurno(Turno.MATUTINO).flatMap((dia) =>
              indicesBloquesPorTurno(Turno.MATUTINO).map((i) => ({
                dia,
                horaInicio: BLOQUES_HORARIOS_OFICIALES[i].horaInicio,
                horaFin: BLOQUES_HORARIOS_OFICIALES[i].horaFin,
                disponible: true,
                prioridadPreferencia: 1,
              }))
            );
            input = {
              periodoId: ids.periodoId,
              seccionesPendientes: [],
              docentes: new Map([[profesorId, { id: profesorId, cedula: 'V-12000000', nombreCompleto: nombre, dedicacion: tipo, disponibilidades }]]),
              espacios: [
                { id: 'aula-1', codigo: 'A1', nombre: 'Aula 1', tipo: 'AULA_TEORICA', capacidad: 40, sedeId: 'sede', activa: true },
                { id: 'aula-2', codigo: 'A2', nombre: 'Aula 2', tipo: 'AULA_TEORICA', capacidad: 40, sedeId: 'sede', activa: true },
              ],
              horariosExistentes: [],
            };
          }
        );

        And(
          '{int} secciones de {int} horas del PFG {string} asignadas a {string} sin horario',
          (_ctx, cantidad: number, horas: number, pfg: string) => {
            horasPorSeccion = horas;
            input.seccionesPendientes = Array.from({ length: cantidad }, (_, i) =>
              seccionSolver({
                id: `inf-${i + 1}`,
                nombreMateria: `${pfg} - Unidad ${i + 1}`,
                profesorId,
                totalHorasAcademicas: horas,
                bloquesRequeridos: horas / 2,
              })
            );
          }
        );

        When('el motor genético distribuye las secciones', () => {
          resultado = new GeneticSolverEngine(input, { maxGeneraciones: 20, tamanoPoblacion: 10 }).resolver();
        });

        Then('cada bloque propuesto coincide con un bloque oficial de {int} minutos', (_ctx, minutos: number) => {
          const requeridos = input.seccionesPendientes.reduce((acc, s) => acc + s.bloquesRequeridos, 0);
          expect(resultado.asignaciones).toHaveLength(requeridos);
          for (const a of resultado.asignaciones) {
            const oficial = BLOQUES_HORARIOS_OFICIALES.find((b) => b.horaInicio === a.horaInicio);
            expect(oficial?.horaFin).toBe(a.horaFin);
            expect(timeToMinutes(a.horaFin) - timeToMinutes(a.horaInicio)).toBe(minutos);
          }
        });

        And('el evaluador no reporta violaciones duras', () => {
          expect(resultado.violacionesDuras).toEqual([]);
          expect(evaluarSolucion(resultado.asignaciones, input).esFactible).toBe(true);
          const franjas = resultado.asignaciones.map((a) => `${a.dia} ${a.horaInicio}`);
          expect(new Set(franjas).size).toBe(franjas.length);
        });

        And('la carga de {string} suma {int} horas con estado normativo {string}', (_ctx, _nombre: string, horas: number, estado: string) => {
          const programadas = [...new Set(resultado.asignaciones.filter((a) => a.profesorId === profesorId).map((a) => a.seccionId))];
          const carga = calcularCargaDocente(
            dedicacion,
            programadas.map(() => ({ horasSemanalesOferta: horasPorSeccion, unidadCurricular: { horasTeoricasSemanales: 0, horasPracticasSemanales: 0 } }))
          );
          expect(carga.horas).toBe(horas);
          expect(carga.estado).toBe(estado);
          expect(carga.maxHoras).toBe(LIMITES_DEDICACION[DedicacionDocente.DEDICACION_EXCLUSIVA].maxDocencia);
        });
      });

      RuleScenario('Rechazo de sobrecarga en ajuste manual', ({ Given, And, When, Then }) => {
        let profesorId: string;
        let adicionalId: string;
        let resultado: RespuestaCapturada;

        Given('un profesor {string} con dedicación {string} registrada en el período', async (_ctx, nombre: string, tipo: string) => {
          const profesor = await f.profesor(nombre);
          profesorId = profesor.id;
          const limites = LIMITES_DEDICACION[tipo];
          await base.prisma.profesorDedicacion.create({
            data: {
              profesorId,
              periodoId: ids.periodoId,
              dedicacion: tipo,
              horasPermanenciaSemanales: limites.maxPermanencia,
              minHorasDocenciaDirecta: limites.minDocencia,
              maxHorasDocenciaDirecta: limites.maxDocencia,
              sedeAdscripcionPrincipalId: ids.sedeId,
            },
          });
        });

        And('{string} tiene {int} asignaciones de {int} horas en el período', async (_ctx, _nombre: string, cantidad: number, horas: number) => {
          for (let i = 1; i <= cantidad; i++) {
            const uc = await f.unidad(ids.pfgId, `ANA-${i}`, `Unidad asignada ${i}`);
            await f.seccion({ periodoId: ids.periodoId, unidadId: uc.id, sedeId: ids.sedeId, codigo: `ANA-${i}-A`, profesorId, horas });
          }
        });

        When('el coordinador asigna a {string} una asignación adicional de {int} horas', async (_ctx, _nombre: string, horas: number) => {
          const uc = await f.unidad(ids.pfgId, 'ANA-EXTRA', 'Unidad adicional');
          adicionalId = (await f.seccion({ periodoId: ids.periodoId, unidadId: uc.id, sedeId: ids.sedeId, codigo: 'ANA-EXTRA-A', horas })).id;
          const req = await peticion({
            usuario: coordinador,
            params: { id: ids.periodoId, seccionId: adicionalId },
            body: { profesorId },
          });
          const { res, capturada } = respuesta();
          await PeriodosController.asignarDocente(req, res);
          resultado = capturada;
        });

        Then('la asignación se rechaza con el mensaje {string}', (_ctx, mensaje: string) => {
          expect(resultado.status).toBe(302);
          expect(parametroRedireccion(resultado.redirect, 'error')).toBe(mensaje);
        });

        And('la asignación adicional sigue sin docente', async () => {
          expect((await base.prisma.seccion.findUniqueOrThrow({ where: { id: adicionalId } })).profesorId).toBeNull();
        });
      });
    });
  },
  { includeTags: ['dedicacion'] }
);
