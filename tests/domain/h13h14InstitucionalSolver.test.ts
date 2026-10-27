import { describe, expect, it } from 'vitest';
import { Turno } from '../../src/core/domain/enums';
import { evaluarSolucion } from '../../src/modules/solver/evaluator';
import { GeneticSolverEngine } from '../../src/modules/solver/geneticEngine';
import {
  AsignacionBloquePropuesta,
  SeccionSolverData,
  SolverInput,
} from '../../src/modules/solver/types';

const seccionMateria = (
  id: string,
  nombreMateria: string,
  profesorId: string | null = null,
  bloquesRequeridos = 1
): SeccionSolverData => ({
  id,
  codigoSeccion: id.toUpperCase(),
  unidadCurricularId: `uc-${id}`,
  nombreMateria,
  sedeId: 'sede-germania',
  profesorId,
  turno: Turno.MATUTINO,
  cuposEstimados: 25,
  totalHorasAcademicas: bloquesRequeridos * 2,
  bloquesRequeridos,
  tipoEspacioRequerido: 'AULA_TEORICA',
  esProyectoComunitario: false,
});

describe('H-13 y H-14 en el Solver (Bloques Institucionales Fijos)', () => {
  const solverInputBase: SolverInput = {
    periodoId: 'p-2026-1',
    seccionesPendientes: [],
    docentes: new Map(),
    espacios: [
      {
        id: 'aula-1',
        codigo: 'A-01',
        nombre: 'Aula 1',
        tipo: 'AULA_TEORICA',
        capacidad: 35,
        sedeId: 'sede-germania',
        pisoNivel: 0,
        activa: true,
      },
      {
        id: 'aula-2',
        codigo: 'A-02',
        nombre: 'Aula 2',
        tipo: 'AULA_TEORICA',
        capacidad: 35,
        sedeId: 'sede-germania',
        pisoNivel: 1,
        activa: true,
      },
    ],
    horariosExistentes: [],
  };

  it('el evaluador genera violación H-13 si se asigna clase en martes 10:45 AM - 12:15 PM', () => {
    const sec = seccionMateria('sec-eco', 'Economía Política');
    const input: SolverInput = {
      ...solverInputBase,
      seccionesPendientes: [sec],
    };

    const propuestaMartesReserva: AsignacionBloquePropuesta = {
      seccionId: sec.id,
      codigoSeccion: sec.codigoSeccion,
      nombreMateria: sec.nombreMateria,
      profesorId: null,
      profesorNombre: 'Por Asignar',
      espacioFisicoId: 'aula-1',
      codigoEspacio: 'A-01',
      sedeId: 'sede-germania',
      dia: 'MARTES',
      horaInicio: '10:45',
      horaFin: '12:15',
      horaInicio12: '10:45 AM',
      horaFin12: '12:15 PM',
      tipoBloque: 'TEORICO',
      bloqueIndice: 0,
    };

    const evaluacion = evaluarSolucion([propuestaMartesReserva], input);
    expect(evaluacion.esFactible).toBe(false);
    const h13 = evaluacion.violacionesDuras.find((v) => v.codigoRegla === 'H-13');
    expect(h13).toBeDefined();
    expect(h13?.mensaje).toContain('Conflicto H-13');
  });

  it('el evaluador genera violación H-14 si Liderazgo 1 no se asigna en Jueves Bloque 1 (07:30 AM - 09:00 AM)', () => {
    const sec = seccionMateria('sec-lid-1', 'Liderazgo 1');
    const input: SolverInput = {
      ...solverInputBase,
      seccionesPendientes: [sec],
    };

    const propuestaFueraBloque: AsignacionBloquePropuesta = {
      seccionId: sec.id,
      codigoSeccion: sec.codigoSeccion,
      nombreMateria: sec.nombreMateria,
      profesorId: null,
      profesorNombre: 'Por Asignar',
      espacioFisicoId: 'aula-1',
      codigoEspacio: 'A-01',
      sedeId: 'sede-germania',
      dia: 'JUEVES',
      horaInicio: '09:05',
      horaFin: '10:35',
      horaInicio12: '09:05 AM',
      horaFin12: '10:35 AM',
      tipoBloque: 'TEORICO',
      bloqueIndice: 0,
    };

    const evaluacion = evaluarSolucion([propuestaFueraBloque], input);
    expect(evaluacion.esFactible).toBe(false);
    const h14 = evaluacion.violacionesDuras.find((v) => v.codigoRegla === 'H-14');
    expect(h14).toBeDefined();
    expect(h14?.mensaje).toContain('Liderazgo 1 debe programarse exclusivamente los días JUEVES en el Bloque 1');
  });

  it('el motor genético programa Liderazgo 1 y Liderazgo 2 en sus bloques exactos sin usar martes de reserva', () => {
    const secLid1 = seccionMateria('lid-1', 'Liderazgo Productivo I');
    const secLid2 = seccionMateria('lid-2', 'Liderazgo Productivo II');
    const secReg = seccionMateria('reg-1', 'Matemática I');

    const input: SolverInput = {
      ...solverInputBase,
      seccionesPendientes: [secLid1, secLid2, secReg],
    };

    const engine = new GeneticSolverEngine(input, {
      maxGeneraciones: 25,
      tamanoPoblacion: 20,
    });

    const resultado = engine.resolver();
    expect(resultado.status).toBe('OPTIMAL');
    expect(resultado.violacionesDuras.length).toBe(0);

    // Verificar Liderazgo 1 en Jueves 07:30 - 09:00
    const asignacionLid1 = resultado.asignaciones.find((a) => a.seccionId === 'lid-1');
    expect(asignacionLid1).toBeDefined();
    expect(asignacionLid1?.dia).toBe('JUEVES');
    expect(asignacionLid1?.horaInicio).toBe('07:30');
    expect(asignacionLid1?.horaFin).toBe('09:00');

    // Verificar Liderazgo 2 en Jueves 09:05 - 10:35
    const asignacionLid2 = resultado.asignaciones.find((a) => a.seccionId === 'lid-2');
    expect(asignacionLid2).toBeDefined();
    expect(asignacionLid2?.dia).toBe('JUEVES');
    expect(asignacionLid2?.horaInicio).toBe('09:05');
    expect(asignacionLid2?.horaFin).toBe('10:35');

    // Verificar que ninguna asignación caiga en martes 10:45 - 12:15
    for (const a of resultado.asignaciones) {
      const enReservaMartes = a.dia === 'MARTES' && a.horaInicio === '10:45';
      expect(enReservaMartes).toBe(false);
    }
  });

  it('permite múltiples secciones paralelas de Liderazgo en el mismo bloque con aulas distintas', () => {
    const secA = seccionMateria('lid-1-a', 'Liderazgo 1');
    const secB = seccionMateria('lid-1-b', 'Liderazgo 1');

    const input: SolverInput = {
      ...solverInputBase,
      seccionesPendientes: [secA, secB],
    };

    const engine = new GeneticSolverEngine(input, {
      maxGeneraciones: 20,
      tamanoPoblacion: 20,
    });

    const resultado = engine.resolver();
    expect(resultado.status).toBe('OPTIMAL');
    expect(resultado.violacionesDuras.length).toBe(0);

    const asigA = resultado.asignaciones.find((a) => a.seccionId === 'lid-1-a')!;
    const asigB = resultado.asignaciones.find((a) => a.seccionId === 'lid-1-b')!;

    // Ambas en Jueves Bloque 1
    expect(asigA.dia).toBe('JUEVES');
    expect(asigA.horaInicio).toBe('07:30');
    expect(asigB.dia).toBe('JUEVES');
    expect(asigB.horaInicio).toBe('07:30');

    // Diferentes aulas físicas sin solapamiento H-02
    expect(asigA.espacioFisicoId).not.toBe(asigB.espacioFisicoId);
  });
});
