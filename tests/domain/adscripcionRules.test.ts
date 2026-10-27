import { describe, it, expect } from 'vitest';
import { DiaSemana, DedicacionDocente } from '../../src/core/domain/enums';
import {
  validarTresDiasDisponibilidad,
  validarDiaEnDisponibilidad,
  calcularDisponibilidadPorAdscripcion,
  compararDocentesParaAsignacion,
} from '../../src/core/domain/rules/adscripcionRules';
import {
  validarHDiasDisponibilidad,
} from '../../src/core/domain/rules/horarioConflictRules';
import {
  validarAsignacionHoraria,
} from '../../src/core/domain/rules/validadorHorarioService';

describe('Reglas de Dominio: Adscripción y Disponibilidad de 3 Días (UBV)', () => {
  describe('validarTresDiasDisponibilidad', () => {
    it('debe aceptar exactamente 3 días válidos en arreglo y ordenarlos', () => {
      const res = validarTresDiasDisponibilidad(['JUEVES', 'LUNES', 'MARTES']);
      expect(res.valido).toBe(true);
      expect(res.dias).toEqual([DiaSemana.LUNES, DiaSemana.MARTES, DiaSemana.JUEVES]);
    });

    it('debe aceptar entrada en formato JSON string', () => {
      const res = validarTresDiasDisponibilidad(JSON.stringify(['MIERCOLES', 'LUNES', 'VIERNES']));
      expect(res.valido).toBe(true);
      expect(res.dias).toEqual([DiaSemana.LUNES, DiaSemana.MIERCOLES, DiaSemana.VIERNES]);
    });

    it('debe aceptar entrada separada por comas', () => {
      const res = validarTresDiasDisponibilidad('lunes, martes, viernes');
      expect(res.valido).toBe(true);
      expect(res.dias).toEqual([DiaSemana.LUNES, DiaSemana.MARTES, DiaSemana.VIERNES]);
    });

    it('debe rechazar si se seleccionan menos de 3 días', () => {
      const res = validarTresDiasDisponibilidad(['LUNES', 'MARTES']);
      expect(res.valido).toBe(false);
      expect(res.error).toContain('exactamente tres (3) días');
    });

    it('debe rechazar si se seleccionan más de 3 días', () => {
      const res = validarTresDiasDisponibilidad(['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES']);
      expect(res.valido).toBe(false);
      expect(res.error).toContain('exactamente tres (3) días');
    });

    it('debe ignorar duplicados y días no válidos (e.g. DOMINGO)', () => {
      const res = validarTresDiasDisponibilidad(['LUNES', 'LUNES', 'DOMINGO', 'MARTES']);
      expect(res.valido).toBe(false);
      expect(res.dias).toEqual([DiaSemana.LUNES, DiaSemana.MARTES]);
    });
  });

  describe('validarDiaEnDisponibilidad', () => {
    it('debe retornar true si no hay días configurados (docente sin restricción previa)', () => {
      expect(validarDiaEnDisponibilidad(DiaSemana.LUNES, null)).toBe(true);
      expect(validarDiaEnDisponibilidad(DiaSemana.SABADO, undefined)).toBe(true);
    });

    it('debe permitir si el día está en los 3 días acordados', () => {
      const acordados = ['LUNES', 'MARTES', 'JUEVES'];
      expect(validarDiaEnDisponibilidad(DiaSemana.LUNES, acordados)).toBe(true);
      expect(validarDiaEnDisponibilidad(DiaSemana.MARTES, JSON.stringify(acordados))).toBe(true);
      expect(validarDiaEnDisponibilidad(DiaSemana.JUEVES, 'LUNES,MARTES,JUEVES')).toBe(true);
    });

    it('debe rechazar si el día no forma parte de los 3 acordados', () => {
      const acordados = ['LUNES', 'MARTES', 'JUEVES'];
      expect(validarDiaEnDisponibilidad(DiaSemana.MIERCOLES, acordados)).toBe(false);
      expect(validarDiaEnDisponibilidad(DiaSemana.VIERNES, JSON.stringify(acordados))).toBe(false);
    });
  });

  describe('calcularDisponibilidadPorAdscripcion', () => {
    it('calcula correctamente horas disponibles para Dedicación Exclusiva (tope 16h)', () => {
      const calc = calcularDisponibilidadPorAdscripcion({
        dedicacion: DedicacionDocente.DEDICACION_EXCLUSIVA,
        horasAsignadas: 10,
        pfgAdscripcionId: 'pfg-inf',
        pfgConsultaId: 'pfg-inf',
      });

      expect(calc.maxHorasDocencia).toBe(16);
      expect(calc.horasAsignadas).toBe(10);
      expect(calc.horasDisponibles).toBe(6);
      expect(calc.esProgramaAdscrito).toBe(true);
      expect(calc.puedeAsumirHoras(4)).toBe(true);
      expect(calc.puedeAsumirHoras(8)).toBe(false);
      expect(calc.advertencia).toBeUndefined();
    });

    it('detecta docente sin horas disponibles y emite advertencia', () => {
      const calc = calcularDisponibilidadPorAdscripcion({
        dedicacion: DedicacionDocente.TIEMPO_COMPLETO, // tope 12h
        horasAsignadas: 12,
        pfgAdscripcionId: 'pfg-inf',
        pfgConsultaId: 'pfg-com',
      });

      expect(calc.horasDisponibles).toBe(0);
      expect(calc.esProgramaAdscrito).toBe(false);
      expect(calc.puedeAsumirHoras(2)).toBe(false);
      expect(calc.advertencia).toContain('sin horas disponibles');
    });
  });

  describe('compararDocentesParaAsignacion (orden del picker)', () => {
    const base = {
      dedicacion: DedicacionDocente.TIEMPO_COMPLETO,
      horas: 4,
      maxHoras: 12,
    };

    it('prioriza al docente adscrito al PFG de la UC sobre otro con la misma carga', () => {
      const adscrito = { id: 'a', nombre: 'Ana López', ...base, pfgAdscripcionId: 'pfg-info' };
      const externo = { id: 'b', nombre: 'Beatriz Díaz', ...base, pfgAdscripcionId: 'pfg-salud' };
      const orden = [externo, adscrito].sort((x, y) =>
        compararDocentesParaAsignacion(x, y, { pfgConsultaId: 'pfg-info' })
      );
      expect(orden.map((d) => d.id)).toEqual(['a', 'b']);
    });

    it('deja primero al profesor ya asignado, aunque no sea adscrito', () => {
      const actual = { id: 'act', nombre: 'Zoe Ruiz', ...base, pfgAdscripcionId: 'pfg-otro' };
      const adscrito = { id: 'ads', nombre: 'Ana López', ...base, pfgAdscripcionId: 'pfg-info' };
      const orden = [adscrito, actual].sort((x, y) =>
        compararDocentesParaAsignacion(x, y, { profesorActualId: 'act', pfgConsultaId: 'pfg-info' })
      );
      expect(orden[0].id).toBe('act');
      expect(orden[1].id).toBe('ads');
    });
  });

  describe('validarHDiasDisponibilidad y orquestador validadorHorarioService', () => {
    it('detecta conflicto H-DIAS-DISPONIBILIDAD cuando el día propuesto está fuera de los 3 acordados', () => {
      const evaluacion = validarHDiasDisponibilidad({
        seccionId: 'sec-1',
        dia: 'MIERCOLES',
        horaInicio: '08:00',
        horaFin: '09:30',
        diasPermitidosDocente: JSON.stringify(['LUNES', 'MARTES', 'JUEVES']),
      });

      expect(evaluacion.valido).toBe(false);
      expect(evaluacion.codigoRegla).toBe('H-DIAS-DISPONIBILIDAD');
      expect(evaluacion.mensaje).toContain('MIERCOLES');
      expect(evaluacion.mensaje).toContain('tres (3) días acordados');
    });

    it('validadorHorarioService orquesta rechazo por H-DIAS-DISPONIBILIDAD', () => {
      const resultado = validarAsignacionHoraria(
        {
          seccionId: 'sec-1',
          profesorId: 'prof-1',
          espacioFisicoId: 'esp-1',
          sedeId: 'sede-1',
          dia: 'VIERNES',
          horaInicio: '08:00',
          horaFin: '09:30',
          diasPermitidosDocente: ['LUNES', 'MARTES', 'JUEVES'],
        },
        []
      );

      expect(resultado.esValido).toBe(false);
      expect(resultado.conflictos.some((c) => c.codigoRegla === 'H-DIAS-DISPONIBILIDAD')).toBe(true);
      expect(resultado.mensajeResumen).toContain('H-DIAS-DISPONIBILIDAD');
    });
  });
});
