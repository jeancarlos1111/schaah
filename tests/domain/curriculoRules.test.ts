import { describe, it, expect } from 'vitest';
import {
  calcularBloquesLectivos,
  validarDistribucionHoras,
  validarEspacioRequerido,
  validarPertenenciaSeccionUC,
  generarCodigoSeccionSugerido,
  obtenerTramosPorTrayecto,
  obtenerTrayectoPorTramo,
  validarCorrespondenciaTrayectoTramo,
} from '../../src/core/domain/rules/curriculoRules';
import { TipoEspacio } from '../../src/core/domain/enums';

describe('Dominio Curricular (Spec 09) - Reglas RC-01 a RC-06', () => {
  describe('RC-03: Cómputo de Horas Lectivas y Bloques Semanales', () => {
    it('calcula correctamente horas lectivas HT + HP excluyendo HC del aforo semanal', () => {
      // Caso materia típica con teoría, práctica y campo
      const res = calcularBloquesLectivos(4, 2, 6, false);
      expect(res.horasLectivasSemanales).toBe(6); // 4 + 2
      expect(res.horasCampoComunitario).toBe(6);
      expect(res.totalHorasAcademicas).toBe(12);
      expect(res.bloques90Min).toBe(3); // 6 / 2
      expect(res.horasRemanentes).toBe(0);
      expect(res.requiereEspacioFisico).toBe(true);
    });

    it('identifica horas remanentes cuando total lectivo es impar', () => {
      const res = calcularBloquesLectivos(3, 0, 0, false);
      expect(res.horasLectivasSemanales).toBe(3);
      expect(res.bloques90Min).toBe(1);
      expect(res.horasRemanentes).toBe(1);
      expect(res.requiereEspacioFisico).toBe(true);
    });

    it('determina que Proyecto Comunitario puro sin HT/HP no requiere aula obligatoria', () => {
      const res = calcularBloquesLectivos(0, 0, 8, true);
      expect(res.horasLectivasSemanales).toBe(0);
      expect(res.horasCampoComunitario).toBe(8);
      expect(res.totalHorasAcademicas).toBe(8);
      expect(res.bloques90Min).toBe(0);
      expect(res.requiereEspacioFisico).toBe(false);
    });

    it('requiere aula si Proyecto Comunitario tiene componente teórico o práctico', () => {
      const res = calcularBloquesLectivos(2, 0, 6, true);
      expect(res.horasLectivasSemanales).toBe(2);
      expect(res.bloques90Min).toBe(1);
      expect(res.requiereEspacioFisico).toBe(true);
    });
  });

  describe('Validación de Distribución de Horas', () => {
    it('aprueba distribución válida con HT > 0', () => {
      const res = validarDistribucionHoras(4, 2, 0);
      expect(res.valido).toBe(true);
      expect(res.error).toBeUndefined();
    });

    it('rechaza si suma de horas es 0', () => {
      const res = validarDistribucionHoras(0, 0, 0);
      expect(res.valido).toBe(false);
      expect(res.error).toContain('al menos una hora asignada');
    });

    it('rechaza horas negativas', () => {
      const res = validarDistribucionHoras(-2, 4, 0);
      expect(res.valido).toBe(false);
      expect(res.error).toContain('valores negativos');
    });
  });

  describe('RC-04 y RC-05: Tipología de Espacio Requerido', () => {
    it('acepta tipo de espacio válido del catálogo institucional', () => {
      const res = validarEspacioRequerido(TipoEspacio.LABORATORIO_INFORMATICA, false);
      expect(res.valido).toBe(true);
      expect(res.tipoEspacioAjustado).toBe(TipoEspacio.LABORATORIO_INFORMATICA);
    });

    it('ajusta automáticamente Proyecto Comunitario a ESPACIO_COMUNITARIO_CAMPO si no tiene espacio asignado', () => {
      const res = validarEspacioRequerido('', true);
      expect(res.valido).toBe(true);
      expect(res.tipoEspacioAjustado).toBe(TipoEspacio.ESPACIO_COMUNITARIO_CAMPO);
    });

    it('rechaza tipología desconocida que no existe en TipoEspacio', () => {
      const res = validarEspacioRequerido('PATIO_DESCONOCIDO', false);
      expect(res.valido).toBe(false);
      expect(res.error).toContain('no es válido');
    });
  });

  describe('RC-02: Pertenencia Estricta Sección a PFG', () => {
    it('aprueba cuando PFG de la sección coincide con PFG de la Unidad Curricular', () => {
      const res = validarPertenenciaSeccionUC('pfg-informatica', 'pfg-informatica');
      expect(res.valido).toBe(true);
    });

    it('rechaza asignación cruzada cuando PFG de la sección difiere del PFG de la UC', () => {
      const res = validarPertenenciaSeccionUC('pfg-agroecologia', 'pfg-informatica');
      expect(res.valido).toBe(false);
      expect(res.error).toContain('Violación RC-02');
    });

    it('rechaza si faltan identificadores', () => {
      const res = validarPertenenciaSeccionUC('', 'pfg-informatica');
      expect(res.valido).toBe(false);
      expect(res.error).toBeDefined();
    });
  });

  describe('Generador de Código Sugerido de Sección', () => {
    it('genera formato canónico SEC-[Periodo]-[CodigoUC]-[Turno]-[Nro]', () => {
      const codigo = generarCodigoSeccionSugerido('2026-I', 'INFO-101', 'MATUTINO', 1);
      expect(codigo).toBe('SEC-2026-I-INFO-101-M-01');
    });

    it('maneja turnos y números de sección correctamente con padding', () => {
      const codigo = generarCodigoSeccionSugerido('2026-I', 'AGRO-202', 'VESPERTINO', 12);
      expect(codigo).toBe('SEC-2026-I-AGRO-202-V-12');
    });
  });

  describe('RC-06: Correspondencia Estricta Trayecto-Tramo (Planilla Oficial UBV)', () => {
    it('valida correspondencia biunívoca en Trayecto I (Tramos 1 y 2)', () => {
      expect(validarCorrespondenciaTrayectoTramo(1, 1).valido).toBe(true);
      expect(validarCorrespondenciaTrayectoTramo(1, 2).valido).toBe(true);
      expect(validarCorrespondenciaTrayectoTramo(1, 3).valido).toBe(false);
      expect(validarCorrespondenciaTrayectoTramo(1, 4).valido).toBe(false);
      expect(validarCorrespondenciaTrayectoTramo(1, 7).valido).toBe(false);
    });

    it('valida correspondencia biunívoca en Trayecto II (Tramos 3 y 4)', () => {
      expect(validarCorrespondenciaTrayectoTramo(2, 3).valido).toBe(true);
      expect(validarCorrespondenciaTrayectoTramo(2, 4).valido).toBe(true);
      expect(validarCorrespondenciaTrayectoTramo(2, 1).valido).toBe(false);
      expect(validarCorrespondenciaTrayectoTramo(2, 2).valido).toBe(false);
      expect(validarCorrespondenciaTrayectoTramo(2, 5).valido).toBe(false);
    });

    it('valida correspondencia biunívoca en Trayecto III (Tramos 5 y 6)', () => {
      expect(validarCorrespondenciaTrayectoTramo(3, 5).valido).toBe(true);
      expect(validarCorrespondenciaTrayectoTramo(3, 6).valido).toBe(true);
      expect(validarCorrespondenciaTrayectoTramo(3, 3).valido).toBe(false);
      expect(validarCorrespondenciaTrayectoTramo(3, 7).valido).toBe(false);
    });

    it('valida correspondencia biunívoca en Trayecto IV (Tramos 7 y 8)', () => {
      expect(validarCorrespondenciaTrayectoTramo(4, 7).valido).toBe(true);
      expect(validarCorrespondenciaTrayectoTramo(4, 8).valido).toBe(true);
      expect(validarCorrespondenciaTrayectoTramo(4, 2).valido).toBe(false);
      expect(validarCorrespondenciaTrayectoTramo(4, 5).valido).toBe(false);
    });

    it('valida correspondencia en Trayecto Inicial / PIU (Trayecto 0 con Tramos 0 y 1)', () => {
      expect(validarCorrespondenciaTrayectoTramo(0, 0).valido).toBe(true);
      expect(validarCorrespondenciaTrayectoTramo(0, 1).valido).toBe(true);
      expect(validarCorrespondenciaTrayectoTramo(0, 2).valido).toBe(false);
    });

    it('emite mensaje de error descriptivo con sugerencia de pertenencia real', () => {
      const res = validarCorrespondenciaTrayectoTramo(1, 5);
      expect(res.valido).toBe(false);
      expect(res.error).toContain('Violación RC-06');
      expect(res.error).toContain('Tramos válidos para Trayecto 1: [1, 2]');
      expect(res.error).toContain('El Tramo 5 pertenece al Trayecto 3');
      expect(res.trayectoCorrespondiente).toBe(3);
    });

    it('deduce correctamente el trayecto mediante obtenerTrayectoPorTramo', () => {
      expect(obtenerTrayectoPorTramo(1)).toBe(1);
      expect(obtenerTrayectoPorTramo(2)).toBe(1);
      expect(obtenerTrayectoPorTramo(3)).toBe(2);
      expect(obtenerTrayectoPorTramo(4)).toBe(2);
      expect(obtenerTrayectoPorTramo(5)).toBe(3);
      expect(obtenerTrayectoPorTramo(6)).toBe(3);
      expect(obtenerTrayectoPorTramo(7)).toBe(4);
      expect(obtenerTrayectoPorTramo(8)).toBe(4);
      expect(obtenerTrayectoPorTramo(0)).toBe(0);
      expect(obtenerTrayectoPorTramo(99)).toBeNull();
    });

    it('rechaza valores fuera de rango o no numéricos', () => {
      expect(validarCorrespondenciaTrayectoTramo(9, 1).valido).toBe(false);
      expect(validarCorrespondenciaTrayectoTramo(NaN as any, 1).valido).toBe(false);
      expect(validarCorrespondenciaTrayectoTramo(1, NaN as any).valido).toBe(false);
    });
  });
});

