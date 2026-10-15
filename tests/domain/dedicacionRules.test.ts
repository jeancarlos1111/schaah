import { describe, it, expect } from 'vitest';
import { DedicacionDocente } from '../../src/core/domain/enums';
import {
  calcularCargaDocente,
  evaluarNormativaDocente,
  LIMITES_DEDICACION,
} from '../../src/core/domain/rules/dedicacionRules';
import { urlRetornoSecciones } from '../../src/modules/periodos/urlRetorno';

const asignacion = (horasOferta: number | null, ht = 3, hp = 1) => ({
  horasSemanalesOferta: horasOferta,
  unidadCurricular: { horasTeoricasSemanales: ht, horasPracticasSemanales: hp },
});

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

  describe('Carga del docente en el período (selector de asignación e inconsistencias)', () => {
    it('suma horas de oferta o HT+HP y calcula las horas disponibles hasta el tope', () => {
      const carga = calcularCargaDocente(DedicacionDocente.TIEMPO_COMPLETO, [asignacion(4), asignacion(null, 2, 1)]);
      expect(carga).toMatchObject({ horas: 7, asignaciones: 2, minHoras: 8, maxHoras: 12, disponibles: 5, estado: 'DEFICIT' });
    });

    it('detecta la sobrecarga real de la oferta 2026-II (48 h con tope de 12 h) y no reporta horas disponibles negativas', () => {
      const carga = calcularCargaDocente(DedicacionDocente.TIEMPO_COMPLETO, Array.from({ length: 12 }, () => asignacion(4)));
      expect(carga).toMatchObject({ horas: 48, maxHoras: 12, disponibles: 0, estado: 'SOBRECARGA' });
    });

    it('marca SIN_DEDICACION cuando el docente no tiene dedicación registrada en el período', () => {
      const carga = calcularCargaDocente(null, [asignacion(6)]);
      expect(carga.estado).toBe('SIN_DEDICACION');
      expect(carga.horas).toBe(6);
      expect(carga.dedicacion).toBeNull();
    });

    it('un docente con dedicación y sin asignaciones queda SIN_ASIGNAR con todas sus horas disponibles', () => {
      const carga = calcularCargaDocente(DedicacionDocente.MEDIO_TIEMPO, []);
      expect(carga).toMatchObject({ horas: 0, asignaciones: 0, disponibles: 8, estado: 'SIN_ASIGNAR' });
    });
  });

  describe('Retorno a la página de secciones tras asignar docente', () => {
    const periodo = 'p-123';

    it('conserva filtros y página, y reemplaza el mensaje anterior', () => {
      const url = urlRetornoSecciones(periodo, '/periodos/p-123/secciones?page=3&grupoId=g1&msg=viejo', 'msg', 'Listo');
      const destino = new URL(url, 'http://x');
      expect(destino.pathname).toBe('/periodos/p-123/secciones');
      expect(destino.searchParams.get('page')).toBe('3');
      expect(destino.searchParams.get('grupoId')).toBe('g1');
      expect(destino.searchParams.get('msg')).toBe('Listo');
      expect(destino.searchParams.has('error')).toBe(false);
    });

    it('ignora destinos externos, de otro período o de otra ruta', () => {
      for (const malicioso of ['https://evil.example/x', '//evil.example', '/periodos/otro/secciones', '/periodos/p-123/seccionesX', '/usuarios', undefined]) {
        const url = urlRetornoSecciones(periodo, malicioso, 'error', 'Fallo');
        expect(url).toBe('/periodos/p-123/secciones?error=Fallo');
      }
    });
  });
});
