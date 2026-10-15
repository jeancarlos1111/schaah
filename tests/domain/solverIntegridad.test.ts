import { describe, expect, it } from 'vitest';
import { CpSatSolverEngine } from '../../src/modules/solver/cpSatEngine';
import { evaluarSolucion } from '../../src/modules/solver/evaluator';
import { GeneticSolverEngine } from '../../src/modules/solver/geneticEngine';
import { DocenteSolverData, SolverInput } from '../../src/modules/solver/types';
import { propuestaBloque, seccionSolver } from '../helpers/solver';

const docente = (id: string, franjasLunes: string[]): DocenteSolverData => ({
  id,
  cedula: `V-${id}`,
  nombreCompleto: `Prof. ${id}`,
  disponibilidades: franjasLunes.map((horaInicio) => ({
    dia: 'LUNES',
    horaInicio,
    horaFin: '09:00',
    disponible: true,
    prioridadPreferencia: 1,
  })),
});

/** Una sección cuyo docente no declaró disponibilidad y otra sin docente que sí puede programarse. */
const entradaMixta = (): SolverInput => ({
  periodoId: 'p',
  seccionesPendientes: [
    seccionSolver({ id: 'sin-disp', profesorId: 'prof-sin', bloquesRequeridos: 2 }),
    seccionSolver({ id: 'libre', bloquesRequeridos: 2 }),
  ],
  docentes: new Map([['prof-sin', docente('prof-sin', [])]]),
  espacios: [{ id: 'aula-1', codigo: 'A1', nombre: 'Aula 1', tipo: 'AULA_TEORICA', capacidad: 40, sedeId: 'sede', activa: true }],
  horariosExistentes: [],
});

function comprobarSeccionNoProgramada(r: Awaited<ReturnType<CpSatSolverEngine['resolver']>>) {
  expect(r.status).toBe('INFEASIBLE');
  expect(r.asignaciones.some((a) => a.seccionId === 'sin-disp')).toBe(false);
  expect(r.asignaciones.filter((a) => a.seccionId === 'libre')).toHaveLength(2);
  expect(r.violacionesDuras).toEqual([
    expect.objectContaining({
      codigoRegla: 'H-06',
      mensaje: 'Sección SIN-DISP sin programar: el docente Prof. prof-sin no ha declarado disponibilidad horaria en el período.',
    }),
  ]);
}

describe('Integridad de asignación semanal: ninguna sección se omite en silencio', () => {
  it('CP-SAT no programa la sección cuyo docente no declaró disponibilidad y lo reporta como H-06 (INFEASIBLE)', async () => {
    comprobarSeccionNoProgramada(await new CpSatSolverEngine(entradaMixta()).resolver());
  });

  it('el motor genético hace lo mismo con la misma entrada', () => {
    comprobarSeccionNoProgramada(new GeneticSolverEngine(entradaMixta(), { maxGeneraciones: 10, tamanoPoblacion: 8 }).resolver());
  });

  it('el evaluador indica cuántas franjas declaró el docente cuando no alcanzan', () => {
    const input = entradaMixta();
    input.seccionesPendientes = [seccionSolver({ id: 'corta', profesorId: 'prof-1', bloquesRequeridos: 2 })];
    input.docentes = new Map([['prof-1', docente('prof-1', ['07:30'])]]);
    const ev = evaluarSolucion(
      [propuestaBloque({ seccionId: 'corta', profesorId: 'prof-1', dia: 'LUNES', horaInicio: '07:30', espacioFisicoId: 'aula-1' })],
      input
    );
    expect(ev.esFactible).toBe(false);
    expect(ev.violacionesDuras).toEqual([
      expect.objectContaining({ codigoRegla: 'H-06', mensaje: expect.stringContaining('declaró 1 franjas disponibles y la materia requiere 2') }),
    ]);
  });

  it('el evaluador marca INTEGRIDAD cuando faltan bloques por otra causa, y acepta la sección completa', () => {
    const input = entradaMixta();
    input.seccionesPendientes = [seccionSolver({ id: 'libre', bloquesRequeridos: 2 })];
    const bloque = (horaInicio: string) => propuestaBloque({ seccionId: 'libre', dia: 'LUNES', horaInicio, espacioFisicoId: 'aula-1' });

    const incompleta = evaluarSolucion([bloque('07:30')], input);
    expect(incompleta.violacionesDuras).toEqual([
      expect.objectContaining({ codigoRegla: 'INTEGRIDAD', mensaje: 'Sección LIBRE incompleta: recibió 1 de 2 bloques semanales; no hay franja factible para el resto.' }),
    ]);

    const completa = evaluarSolucion([bloque('07:30'), { ...bloque('09:05'), bloqueIndice: 1 }], input);
    expect(completa.esFactible).toBe(true);
  });
});
