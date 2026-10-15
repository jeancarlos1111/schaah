import { afterAll, expect } from 'vitest';
import { describeFeature } from '@amiceli/vitest-cucumber';
import { RolUsuario, TipoBloqueAcademico } from '../../src/core/domain/enums';
import { evaluarSolucion } from '../../src/modules/solver/evaluator';
import { GeneticSolverEngine } from '../../src/modules/solver/geneticEngine';
import { SolverInput, SolverResult } from '../../src/modules/solver/types';
import { crearBaseTemporal, sembrarPeriodoBase } from '../helpers/baseTemporal';
import { fabrica } from '../helpers/fabrica';
import { RespuestaCapturada, peticion, respuesta } from '../helpers/peticiones';
import { seccionSolver } from '../helpers/solver';
import { cargarSpec05 } from './spec05';

const feature = await cargarSpec05();
const base = crearBaseTemporal();
const ids = await sembrarPeriodoBase(base.prisma);
const f = fabrica(base.prisma);
const coordinador = await f.usuario('coord.informatica@ubv.edu.ve', RolUsuario.COORDINADOR_PFG, [ids.pfgId]);
const { HorariosController } = await import('../../src/modules/horarios/controllers/HorariosController');
afterAll(() => base.cerrar());

async function colocar(seccionId: string, dia: string, horaInicio: string, horaFin: string, espacioFisicoId?: string) {
  const req = await peticion({
    usuario: coordinador,
    json: true,
    params: { id: ids.periodoId },
    body: { seccionId, dia, horaInicio, horaFin, espacioFisicoId },
  });
  const { res, capturada } = respuesta();
  await HorariosController.moverBloque(req, res);
  return capturada;
}

describeFeature(
  feature,
  ({ Rule }) => {
    Rule('Proyecto comunitario sin aula física (H-08)', ({ RuleScenario }) => {
      RuleScenario('El motor agenda el proyecto comunitario sin reservar aula', ({ Given, And, When, Then }) => {
        let nombreUnidad: string;
        let input: SolverInput;
        let resultado: SolverResult;

        Given('la unidad curricular {string} marcada como proyecto comunitario', (_ctx, nombre: string) => {
          nombreUnidad = nombre;
        });

        And('su sección {string} de {int} horas sin horario en una sede con aulas libres', (_ctx, codigo: string, horas: number) => {
          input = {
            periodoId: ids.periodoId,
            seccionesPendientes: [
              seccionSolver({
                id: codigo,
                codigoSeccion: codigo,
                nombreMateria: nombreUnidad,
                totalHorasAcademicas: horas,
                bloquesRequeridos: horas / 2,
                tipoEspacioRequerido: 'ESPACIO_COMUNITARIO_CAMPO',
                esProyectoComunitario: true,
              }),
            ],
            docentes: new Map(),
            espacios: [
              { id: 'aula-1', codigo: 'A1', nombre: 'Aula 1', tipo: 'AULA_TEORICA', capacidad: 40, sedeId: 'sede', activa: true },
              { id: 'campo-1', codigo: 'C1', nombre: 'Campo', tipo: 'ESPACIO_COMUNITARIO_CAMPO', capacidad: 60, sedeId: 'sede', activa: true },
            ],
            horariosExistentes: [],
          };
        });

        When('el motor genético agenda sus bloques', () => {
          resultado = new GeneticSolverEngine(input, { maxGeneraciones: 10, tamanoPoblacion: 6 }).resolver();
        });

        Then('ningún bloque propuesto reserva espacio físico', () => {
          expect(resultado.asignaciones).toHaveLength(input.seccionesPendientes[0].bloquesRequeridos);
          expect(resultado.asignaciones.every((a) => a.espacioFisicoId === null)).toBe(true);
          expect(resultado.violacionesDuras).toEqual([]);
        });

        And('el tipo de bloque propuesto es {string}', (_ctx, tipo: string) => {
          expect(resultado.asignaciones.map((a) => a.tipoBloque)).toEqual(resultado.asignaciones.map(() => tipo));
        });

        And('el evaluador marca {string} si a ese bloque se le asigna un aula', (_ctx, regla: string) => {
          const [primero, ...resto] = resultado.asignaciones;
          const conAula = evaluarSolucion([{ ...primero, espacioFisicoId: 'aula-1' }, ...resto], input);
          expect(conAula.esFactible).toBe(false);
          expect(conAula.violacionesDuras.map((v) => v.codigoRegla)).toEqual([regla]);
        });
      });

      RuleScenario('Colocar el proyecto en la matriz no reserva el aula indicada', ({ Given, When, Then, And }) => {
        let proyectoId: string;
        let profesorId: string;
        let aulaId: string;
        let resultado: RespuestaCapturada;

        Given('la sección de proyecto {string} con su docente asignado', async (_ctx, codigo: string) => {
          profesorId = (await f.profesor('Luisa Campos')).id;
          const uc = await f.unidad(ids.pfgId, 'PC-III', 'Proyecto Comunitario III', { esProyectoComunitario: true, horasTeoricas: 0, horasPracticas: 4 });
          proyectoId = (await f.seccion({ periodoId: ids.periodoId, unidadId: uc.id, sedeId: ids.sedeId, codigo, profesorId })).id;
        });

        When(
          'el coordinador la coloca el {string} de {string} a {string} indicando el aula {string}',
          async (_ctx, dia: string, inicio: string, fin: string, aula: string) => {
            aulaId = (await f.aula(ids.sedeId, aula, 40)).id;
            resultado = await colocar(proyectoId, dia, inicio, fin, aulaId);
          }
        );

        Then('el bloque se guarda con {string} nulo y tipo {string}', async (_ctx, _campo: string, tipo: string) => {
          expect(resultado.status).toBe(200);
          expect(resultado.json.success).toBe(true);
          const guardado = await base.prisma.horarioSeccion.findFirstOrThrow({ where: { seccionId: proyectoId } });
          expect(guardado.espacioFisicoId).toBeNull();
          expect(guardado.tipoBloque).toBe(tipo);
          expect(tipo).toBe(TipoBloqueAcademico.PROYECTO_COMUNITARIO);
        });

        And('el bloque ocupa el horario del docente para otra sección el {string} a las {string}', async (_ctx, dia: string, hora: string) => {
          const uc = await f.unidad(ids.pfgId, 'INF-OTRA', 'Otra unidad del docente');
          const otra = await f.seccion({ periodoId: ids.periodoId, unidadId: uc.id, sedeId: ids.sedeId, codigo: 'INF-OTRA-A', profesorId });
          const r = await colocar(otra.id, dia, hora, '09:00');
          expect(r.status).toBe(409);
          expect(r.json.conflictos.map((c: { codigoRegla: string }) => c.codigoRegla)).toEqual(['H-01']);
        });

        And('el aula {string} sigue libre el {string} a las {string}', async (_ctx, _aula: string, dia: string, hora: string) => {
          const uc = await f.unidad(ids.pfgId, 'INF-AULA', 'Unidad presencial');
          const presencial = await f.seccion({ periodoId: ids.periodoId, unidadId: uc.id, sedeId: ids.sedeId, codigo: 'INF-AULA-A' });
          const r = await colocar(presencial.id, dia, hora, '09:00', aulaId);
          expect(r.status).toBe(200);
          expect((await base.prisma.horarioSeccion.findFirstOrThrow({ where: { seccionId: presencial.id } })).espacioFisicoId).toBe(aulaId);
        });
      });
    });
  },
  { includeTags: ['proyecto'] }
);
