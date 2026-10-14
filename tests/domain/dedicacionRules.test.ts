import { describe, it, expect } from 'vitest';
import { DedicacionDocente } from '../../src/core/domain/enums';
import {
  evaluarNormativaDocente,
  LIMITES_DEDICACION,
} from '../../src/core/domain/rules/dedicacionRules';

describe('Reglas de Dominio: Dedicación Docente (H-04 y H-05)', () => {
  describe('Dedicación Exclusiva (DE: 12h - 16h docencia directa)', () => {
    it('debe catalogar como EN_NORMA cuando las horas están en el rango exacto (12h a 16h)', () => {
      const res12 = evaluarNormativaDocente(DedicacionDocente.DEDICACION_EXCLUSIVA, 12);
      expect(res12.estado).toBe('EN_NORMA');
      expect(res12.diferencia).toBe(0);

      const res14 = evaluarNormativaDocente(DedicacionDocente.DEDICACION_EXCLUSIVA, 14);
      expect(res14.estado).toBe('EN_NORMA');

      const res16 = evaluarNormativaDocente(DedicacionDocente.DEDICACION_EXCLUSIVA, 16);
      expect(res16.estado).toBe('EN_NORMA');
    });

    it('debe alertar DEFICIT cuando las horas asignadas son inferiores al mínimo legal (12h)', () => {
      const res = evaluarNormativaDocente(DedicacionDocente.DEDICACION_EXCLUSIVA, 10);
      expect(res.estado).toBe('DEFICIT');
      expect(res.diferencia).toBe(-2);
      expect(res.mensaje).toContain('Déficit de 2h');
    });

    it('debe rechazar SOBRECARGA cuando supera el tope legal máximo (16h)', () => {
      const res = evaluarNormativaDocente(DedicacionDocente.DEDICACION_EXCLUSIVA, 18);
      expect(res.estado).toBe('SOBRECARGA');
      expect(res.diferencia).toBe(2);
      expect(res.mensaje).toContain('Sobrecarga de 2h');
    });

    it('debe marcar SIN_ASIGNAR si las horas son 0', () => {
      const res = evaluarNormativaDocente(DedicacionDocente.DEDICACION_EXCLUSIVA, 0);
      expect(res.estado).toBe('SIN_ASIGNAR');
      expect(res.minHoras).toBe(12);
    });
  });

  describe('Tiempo Completo (TC: 8h - 12h docencia directa)', () => {
    it('debe aceptar 10h como EN_NORMA', () => {
      const res = evaluarNormativaDocente(DedicacionDocente.TIEMPO_COMPLETO, 10);
      expect(res.estado).toBe('EN_NORMA');
    });

    it('debe detectar sobrecarga si supera 12h', () => {
      const res = evaluarNormativaDocente(DedicacionDocente.TIEMPO_COMPLETO, 14);
      expect(res.estado).toBe('SOBRECARGA');
      expect(res.diferencia).toBe(2);
    });
  });

  describe('Límites legales institucionales UBV', () => {
    it('debe respetar los topes establecidos en la Ley de Universidades y CCU', () => {
      expect(LIMITES_DEDICACION[DedicacionDocente.DEDICACION_EXCLUSIVA].minDocencia).toBe(12);
      expect(LIMITES_DEDICACION[DedicacionDocente.DEDICACION_EXCLUSIVA].maxDocencia).toBe(16);
      expect(LIMITES_DEDICACION[DedicacionDocente.TIEMPO_COMPLETO].minDocencia).toBe(8);
      expect(LIMITES_DEDICACION[DedicacionDocente.TIEMPO_COMPLETO].maxDocencia).toBe(12);
      expect(LIMITES_DEDICACION[DedicacionDocente.MEDIO_TIEMPO].minDocencia).toBe(4);
      expect(LIMITES_DEDICACION[DedicacionDocente.MEDIO_TIEMPO].maxDocencia).toBe(8);
    });
  });
});
