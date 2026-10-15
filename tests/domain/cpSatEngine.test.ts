import { describe, expect, it } from 'vitest';
import { CpSatSolverEngine } from '../../src/modules/solver/cpSatEngine';
import { BloqueOcupadoExistente, DocenteSolverData, EspacioSolverData, SolverInput } from '../../src/modules/solver/types';
import { seccionSolver } from '../helpers/solver';

const aula = (id: string): EspacioSolverData => ({
  id,
  codigo: id.toUpperCase(),
  nombre: id,
  tipo: 'AULA_TEORICA',
  capacidad: 40,
  sedeId: 'sede',
  activa: true,
});

/** Docente que solo puede dar clase el lunes a las franjas indicadas. */
const docenteLunes = (id: string, horas: string[]): DocenteSolverData => ({
  id,
  cedula: `V-${id}`,
  nombreCompleto: `Prof. ${id}`,
  disponibilidades: horas.map((horaInicio) => ({
    dia: 'LUNES',
    horaInicio,
    horaFin: horaInicio === '07:30' ? '09:00' : '10:35',
    disponible: true,
    prioridadPreferencia: 1,
  })),
});

const ocupado = (datos: Partial<BloqueOcupadoExistente>): BloqueOcupadoExistente => ({
  id: 'h-ajeno',
  seccionId: 'sec-otro-programa',
  sedeId: 'sede',
  dia: 'LUNES',
  horaInicio: '07:30',
  horaFin: '09:00',
  ...datos,
});

const entrada = (datos: Partial<SolverInput>): SolverInput => ({
  periodoId: 'p',
  seccionesPendientes: [],
  docentes: new Map(),
  espacios: [aula('aula-1')],
  horariosExistentes: [],
  ...datos,
});

describe('Motor CP-SAT (OR-Tools WebAssembly, requiere Node 22)', () => {
  it('H-08: programa el proyecto comunitario sin aula y la materia regular en aula, sin violaciones', async () => {
    const r = await new CpSatSolverEngine(
      entrada({
        seccionesPendientes: [
          seccionSolver({ id: 'pc', grupoId: 'g1', bloquesRequeridos: 2, esProyectoComunitario: true, tipoEspacioRequerido: 'ESPACIO_COMUNITARIO_CAMPO' }),
          seccionSolver({ id: 'reg', grupoId: 'g1', bloquesRequeridos: 2 }),
        ],
      })
    ).resolver();

    expect(['OPTIMAL', 'FEASIBLE']).toContain(r.status);
    const proyecto = r.asignaciones.filter((a) => a.seccionId === 'pc');
    expect(proyecto).toHaveLength(2);
    expect(proyecto.every((a) => a.espacioFisicoId === null && a.tipoBloque === 'PROYECTO_COMUNITARIO')).toBe(true);
    expect(r.asignaciones.filter((a) => a.seccionId === 'reg').every((a) => a.espacioFisicoId === 'aula-1')).toBe(true);
    const franjasCohorte = r.asignaciones.map((a) => `${a.dia} ${a.horaInicio}`);
    expect(new Set(franjasCohorte).size).toBe(franjasCohorte.length);
    expect(r.violacionesDuras).toEqual([]);
  });

  it('H-02: no usa un aula que otro programa ya ocupa en esa franja', async () => {
    const r = await new CpSatSolverEngine(
      entrada({
        seccionesPendientes: [seccionSolver({ id: 'info', profesorId: 'prof-1' })],
        docentes: new Map([['prof-1', docenteLunes('prof-1', ['07:30', '09:05'])]]),
        horariosExistentes: [ocupado({ espacioFisicoId: 'aula-1', profesorId: 'prof-otro' })],
      })
    ).resolver();

    expect(r.status).toBe('OPTIMAL');
    expect(r.asignaciones).toEqual([expect.objectContaining({ dia: 'LUNES', horaInicio: '09:05', espacioFisicoId: 'aula-1' })]);
  });

  it('H-01: no programa al docente donde ya dicta clase en otro programa, aunque el aula esté libre', async () => {
    const r = await new CpSatSolverEngine(
      entrada({
        seccionesPendientes: [seccionSolver({ id: 'info', profesorId: 'prof-1' })],
        docentes: new Map([['prof-1', docenteLunes('prof-1', ['07:30', '09:05'])]]),
        espacios: [aula('aula-1'), aula('aula-2')],
        horariosExistentes: [ocupado({ espacioFisicoId: 'aula-2', profesorId: 'prof-1' })],
      })
    ).resolver();

    expect(r.status).toBe('OPTIMAL');
    expect(r.asignaciones).toEqual([expect.objectContaining({ dia: 'LUNES', horaInicio: '09:05' })]);
  });

  it('sin franja posible responde INFEASIBLE y no propone bloques', async () => {
    const r = await new CpSatSolverEngine(
      entrada({
        seccionesPendientes: [seccionSolver({ id: 'info', profesorId: 'prof-1' })],
        docentes: new Map([['prof-1', docenteLunes('prof-1', ['07:30'])]]),
        horariosExistentes: [ocupado({ espacioFisicoId: 'aula-1', profesorId: 'prof-otro' })],
      })
    ).resolver();

    expect(r.status).toBe('INFEASIBLE');
    expect(r.asignaciones).toEqual([]);
  });
});
