import { describe, it, expect } from 'vitest';
import {
  normalizarNivelPiso,
  validarAccesoPiso,
  etiquetaPiso,
} from '../../src/core/domain/rules/pisoRules';
import {
  validarHAccesibilidadPiso,
} from '../../src/core/domain/rules/horarioConflictRules';
import {
  validarAsignacionHoraria,
} from '../../src/core/domain/rules/validadorHorarioService';

describe('Reglas de Dominio: Accesibilidad y Restricción de Piso (UBV)', () => {
  describe('normalizarNivelPiso', () => {
    it('debe mapear PB, Planta Baja y 0 a nivel 0', () => {
      expect(normalizarNivelPiso('PB')).toBe(0);
      expect(normalizarNivelPiso('pb')).toBe(0);
      expect(normalizarNivelPiso('PLANTA BAJA')).toBe(0);
      expect(normalizarNivelPiso('Planta baja')).toBe(0);
      expect(normalizarNivelPiso(0)).toBe(0);
      expect(normalizarNivelPiso('0')).toBe(0);
      expect(normalizarNivelPiso(null)).toBe(0);
      expect(normalizarNivelPiso(undefined)).toBe(0);
    });

    it('debe extraer el número de piso correctamente', () => {
      expect(normalizarNivelPiso('Piso 1')).toBe(1);
      expect(normalizarNivelPiso('P1')).toBe(1);
      expect(normalizarNivelPiso('Nivel 2')).toBe(2);
      expect(normalizarNivelPiso(3)).toBe(3);
      expect(normalizarNivelPiso('Piso 4 - Ala Norte')).toBe(4);
    });
  });

  describe('validarAccesoPiso', () => {
    it('debe permitir cualquier piso si el docente no tiene restricción (null o undefined)', () => {
      expect(validarAccesoPiso(null, 'Piso 3')).toBe(true);
      expect(validarAccesoPiso(undefined, 2)).toBe(true);
    });

    it('debe permitir acceso si el piso del aula es menor o igual al piso máximo', () => {
      expect(validarAccesoPiso(0, 'PB')).toBe(true);
      expect(validarAccesoPiso(1, 'PB')).toBe(true);
      expect(validarAccesoPiso(1, 'Piso 1')).toBe(true);
      expect(validarAccesoPiso(2, 'Piso 1')).toBe(true);
      expect(validarAccesoPiso(2, 2)).toBe(true);
    });

    it('debe rechazar acceso si el piso del aula supera el piso máximo', () => {
      expect(validarAccesoPiso(0, 'Piso 1')).toBe(false);
      expect(validarAccesoPiso(0, 1)).toBe(false);
      expect(validarAccesoPiso(1, 'Piso 2')).toBe(false);
      expect(validarAccesoPiso(2, 'Piso 3')).toBe(false);
    });
  });

  describe('etiquetaPiso', () => {
    it('debe generar la etiqueta adecuada', () => {
      expect(etiquetaPiso(0)).toBe('Planta Baja (PB)');
      expect(etiquetaPiso('PB')).toBe('Planta Baja (PB)');
      expect(etiquetaPiso(1)).toBe('Piso 1');
      expect(etiquetaPiso('Piso 2')).toBe('Piso 2');
    });
  });

  describe('validarHAccesibilidadPiso y orquestador validarAsignacionHoraria', () => {
    it('detecta conflicto cuando el docente tiene restricción de piso y el espacio supera el límite', () => {
      const evaluacion = validarHAccesibilidadPiso({
        seccionId: 'sec-1',
        dia: 'LUNES',
        horaInicio: '08:00',
        horaFin: '09:30',
        pisoMaximoDocente: 0,
        pisoNivelEspacio: 2,
      });

      expect(evaluacion.valido).toBe(false);
      expect(evaluacion.codigoRegla).toBe('H-ACCESIBILIDAD-PISO');
      expect(evaluacion.mensaje).toContain('Piso 2');
      expect(evaluacion.mensaje).toContain('Planta Baja (PB)');
    });

    it('validadorHorarioService orquesta H-ACCESIBILIDAD-PISO rechazando la propuesta', () => {
      const resultado = validarAsignacionHoraria(
        {
          seccionId: 'sec-1',
          profesorId: 'prof-1',
          espacioFisicoId: 'esp-2',
          sedeId: 'sede-1',
          dia: 'LUNES',
          horaInicio: '08:00',
          horaFin: '09:30',
          pisoMaximoDocente: 0,
          pisoNivelEspacio: 1,
        },
        []
      );

      expect(resultado.esValido).toBe(false);
      expect(resultado.conflictos.some((c) => c.codigoRegla === 'H-ACCESIBILIDAD-PISO')).toBe(true);
      expect(resultado.mensajeResumen).toContain('H-ACCESIBILIDAD-PISO');
    });
  });
});
