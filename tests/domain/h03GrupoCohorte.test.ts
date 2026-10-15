import { describe, it, expect } from 'vitest';
import { validarAsignacionHoraria } from '../../src/core/domain/rules/validadorHorarioService';
import {
  BloqueHorarioExistente,
  claveCohorte,
  validarH03NoSolapamientoSeccion,
} from '../../src/core/domain/rules/horarioConflictRules';
import {
  BLOQUES_HORARIOS_OFICIALES,
  diasPorTurno,
  indicesBloquesPorTurno,
} from '../../src/core/domain/rules/timeSlotUtils';
import { Turno } from '../../src/core/domain/enums';
import { evaluarSolucion } from '../../src/modules/solver/evaluator';
import { GeneticSolverEngine } from '../../src/modules/solver/geneticEngine';
import { AsignacionBloquePropuesta, SeccionSolverData, SolverInput } from '../../src/modules/solver/types';

describe('H-03 por grupo/cohorte (oferta 2026-II: una sección agrupa varias UC)', () => {
  const bloqueSeminario: BloqueHorarioExistente = {
    id: 'h-seminario',
    seccionId: 'asig-seminario',
    grupoId: 'grupo-rc-01-a-m',
    grupoCodigo: 'KV-BO-RC-01-A-M',
    codigoSeccion: 'KV-BO-RC-01-A-M-PIU-SC',
    unidadCurricularNombre: 'Seminario de Contexto',
    profesorId: 'prof-bonalde',
    espacioFisicoId: 'aula-1',
    sedeId: 'sede',
    dia: 'LUNES',
    horaInicio: '07:30',
    horaFin: '09:00',
  };

  it('rechaza otra UC del mismo grupo en la misma franja aunque sea otra asignación y otro docente', () => {
    const resultado = validarAsignacionHoraria(
      {
        seccionId: 'asig-matematica',
        grupoId: 'grupo-rc-01-a-m',
        profesorId: 'prof-verde',
        espacioFisicoId: 'aula-2',
        sedeId: 'sede',
        dia: 'LUNES',
        horaInicio: '08:00',
        horaFin: '09:30',
      },
      [bloqueSeminario]
    );

    expect(resultado.esValido).toBe(false);
    const h03 = resultado.conflictos.find((c) => c.codigoRegla === 'H-03');
    expect(h03).toBeDefined();
    expect(h03!.mensaje).toContain('del grupo KV-BO-RC-01-A-M');
    expect(h03!.mensaje).toContain('Seminario de Contexto');
  });

  it('permite la misma franja para grupos distintos', () => {
    const resultado = validarAsignacionHoraria(
      {
        seccionId: 'asig-matematica-b',
        grupoId: 'grupo-rc-01-b-m',
        profesorId: 'prof-verde',
        espacioFisicoId: 'aula-2',
        sedeId: 'sede',
        dia: 'LUNES',
        horaInicio: '07:30',
        horaFin: '09:00',
      },
      [bloqueSeminario]
    );
    expect(resultado.conflictos.some((c) => c.codigoRegla === 'H-03')).toBe(false);
    expect(resultado.esValido).toBe(true);
  });

  it('permite al mismo grupo bloques contiguos sin solapamiento', () => {
    const r = validarH03NoSolapamientoSeccion(
      { seccionId: 'asig-matematica', grupoId: 'grupo-rc-01-a-m', dia: 'LUNES', horaInicio: '09:05', horaFin: '10:35' },
      [bloqueSeminario]
    );
    expect(r.valido).toBe(true);
  });

  it('sin grupo conserva el comportamiento por asignación individual', () => {
    expect(claveCohorte({ seccionId: 's1' })).toBe('S:s1');
    expect(claveCohorte({ seccionId: 's1', grupoId: 'g1' })).toBe('G:g1');
    const r = validarH03NoSolapamientoSeccion(
      { seccionId: 'otra', dia: 'LUNES', horaInicio: '07:30', horaFin: '09:00' },
      [{ ...bloqueSeminario, grupoId: null }]
    );
    expect(r.valido).toBe(true);
  });

  describe('Solver', () => {
    const seccion = (id: string, grupoId: string | null): SeccionSolverData => ({
      id,
      grupoId,
      codigoSeccion: id.toUpperCase(),
      unidadCurricularId: `uc-${id}`,
      nombreMateria: `Materia ${id}`,
      sedeId: 'sede',
      profesorId: null,
      turno: Turno.MATUTINO,
      cuposEstimados: 30,
      totalHorasAcademicas: 2,
      bloquesRequeridos: 1,
      tipoEspacioRequerido: 'AULA_TEORICA',
      esProyectoComunitario: false,
    });

    const baseInput = (secciones: SeccionSolverData[]): SolverInput => ({
      periodoId: 'p',
      seccionesPendientes: secciones,
      docentes: new Map(),
      espacios: [
        { id: 'aula-1', codigo: 'A1', nombre: 'Aula 1', tipo: 'AULA_TEORICA', capacidad: 40, sedeId: 'sede', activa: true },
        { id: 'aula-2', codigo: 'A2', nombre: 'Aula 2', tipo: 'AULA_TEORICA', capacidad: 40, sedeId: 'sede', activa: true },
      ],
      horariosExistentes: [],
    });

    const propuesta = (seccionId: string, espacio: string): AsignacionBloquePropuesta => ({
      seccionId,
      codigoSeccion: seccionId,
      nombreMateria: seccionId,
      profesorId: null,
      profesorNombre: 'Por Definir',
      espacioFisicoId: espacio,
      codigoEspacio: espacio,
      sedeId: 'sede',
      dia: 'MARTES',
      horaInicio: '07:30',
      horaFin: '09:00',
      horaInicio12: '07:30 AM',
      horaFin12: '09:00 AM',
      tipoBloque: 'DOCENCIA_AULA',
      bloqueIndice: 0,
    });

    it('el evaluador penaliza dos UC del mismo grupo en el mismo bloque (aulas distintas)', () => {
      const input = baseInput([seccion('a', 'g1'), seccion('b', 'g1')]);
      const ev = evaluarSolucion([propuesta('a', 'aula-1'), propuesta('b', 'aula-2')], input);
      expect(ev.esFactible).toBe(false);
      expect(ev.violacionesDuras.some((v) => v.codigoRegla === 'H-03')).toBe(true);
    });

    it('el evaluador acepta el mismo bloque para grupos distintos', () => {
      const input = baseInput([seccion('a', 'g1'), seccion('b', 'g2')]);
      const ev = evaluarSolucion([propuesta('a', 'aula-1'), propuesta('b', 'aula-2')], input);
      expect(ev.violacionesDuras.some((v) => v.codigoRegla === 'H-03')).toBe(false);
    });

    it('el evaluador detecta choque con un bloque ya fijado del mismo grupo', () => {
      const input = baseInput([seccion('a', 'g1')]);
      input.horariosExistentes = [
        { id: 'fijo', seccionId: 'z', grupoId: 'g1', sedeId: 'sede', dia: 'MARTES', horaInicio: '07:30', horaFin: '09:00' },
      ];
      const ev = evaluarSolucion([propuesta('a', 'aula-1')], input);
      expect(ev.violacionesDuras.some((v) => v.codigoRegla === 'H-03')).toBe(true);
    });

    it('el motor genético calendariza las UC de un grupo en franjas distintas', () => {
      const input = baseInput([seccion('a', 'g1'), seccion('b', 'g1'), seccion('c', 'g1')]);
      const resultado = new GeneticSolverEngine(input, { maxGeneraciones: 10, tamanoPoblacion: 8 }).resolver();

      expect(resultado.violacionesDuras.filter((v) => v.codigoRegla === 'H-03')).toEqual([]);
      const franjas = resultado.asignaciones.map((a) => `${a.dia}_${a.horaInicio}`);
      expect(new Set(franjas).size).toBe(3);
    });
  });

  describe('Bloques admisibles por turno', () => {
    it('restringe MATUTINO/VESPERTINO/NOCTURNO y abre toda la jornada para UNICA', () => {
      expect(indicesBloquesPorTurno(Turno.MATUTINO)).toEqual([0, 1, 2]);
      expect(indicesBloquesPorTurno(Turno.VESPERTINO)).toEqual([3, 4, 5]);
      expect(indicesBloquesPorTurno(Turno.NOCTURNO)).toEqual([6, 7]);
      expect(indicesBloquesPorTurno(Turno.UNICA)).toHaveLength(BLOQUES_HORARIOS_OFICIALES.length);
      expect(indicesBloquesPorTurno(null)).toHaveLength(BLOQUES_HORARIOS_OFICIALES.length);
    });

    it('fin de semana solo admite sábado', () => {
      expect(diasPorTurno(Turno.FIN_DE_SEMANA)).toEqual(['SABADO']);
      expect(diasPorTurno(Turno.MATUTINO)).toContain('LUNES');
    });
  });
});
