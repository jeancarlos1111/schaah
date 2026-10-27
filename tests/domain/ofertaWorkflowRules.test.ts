import { describe, it, expect } from 'vitest';
import { RolUsuario } from '../../src/core/domain/enums';
import {
  EstadoPeriodoOferta,
  puedeRegistrarOferta,
  validarTransicionEstadoPeriodo,
  validarPrerrequisitosApertura,
} from '../../src/core/domain/rules/ofertaWorkflowRules';

describe('Reglas de Dominio: Flujo de Oferta Académica y Ventana de Coordinación (Fase 3)', () => {
  describe('puedeRegistrarOferta', () => {
    it('administrador y planificador pueden registrar oferta mientras el período no esté cerrado', () => {
      const estadosAbiertos = [
        EstadoPeriodoOferta.BORRADOR,
        EstadoPeriodoOferta.REGISTRO_OFERTAS,
        EstadoPeriodoOferta.PLANIFICACION,
        EstadoPeriodoOferta.OFERTA_APROBADA,
        EstadoPeriodoOferta.ACTIVO,
      ];

      for (const estado of estadosAbiertos) {
        expect(puedeRegistrarOferta(estado, RolUsuario.ADMINISTRADOR)).toBe(true);
        expect(puedeRegistrarOferta(estado, RolUsuario.PLANIFICADOR)).toBe(true);
      }

      // Si el período está cerrado, se bloquea la edición incluso para administradores
      expect(puedeRegistrarOferta(EstadoPeriodoOferta.CERRADO, RolUsuario.ADMINISTRADOR)).toBe(false);
      expect(puedeRegistrarOferta(EstadoPeriodoOferta.CERRADO, RolUsuario.PLANIFICADOR)).toBe(false);
    });

    it('coordinador solo puede registrar oferta dentro de la ventana de oferta habilitada', () => {
      expect(puedeRegistrarOferta(EstadoPeriodoOferta.BORRADOR, RolUsuario.COORDINADOR_PFG)).toBe(true);
      expect(puedeRegistrarOferta(EstadoPeriodoOferta.REGISTRO_OFERTAS, RolUsuario.COORDINADOR_PFG)).toBe(true);
      expect(puedeRegistrarOferta(EstadoPeriodoOferta.PLANIFICACION, RolUsuario.COORDINADOR_PFG)).toBe(true);

      // Bloqueado cuando la oferta fue aprobada o publicada
      expect(puedeRegistrarOferta(EstadoPeriodoOferta.OFERTA_APROBADA, RolUsuario.COORDINADOR_PFG)).toBe(false);
      expect(puedeRegistrarOferta(EstadoPeriodoOferta.ACTIVO, RolUsuario.COORDINADOR_PFG)).toBe(false);
      expect(puedeRegistrarOferta(EstadoPeriodoOferta.PUBLICADA, RolUsuario.COORDINADOR_PFG)).toBe(false);
      expect(puedeRegistrarOferta(EstadoPeriodoOferta.CERRADO, RolUsuario.COORDINADOR_PFG)).toBe(false);
    });

    it('docentes nunca tienen permiso para registrar oferta', () => {
      expect(puedeRegistrarOferta(EstadoPeriodoOferta.REGISTRO_OFERTAS, RolUsuario.DOCENTE)).toBe(false);
      expect(puedeRegistrarOferta(EstadoPeriodoOferta.BORRADOR, RolUsuario.DOCENTE)).toBe(false);
    });
  });

  describe('validarTransicionEstadoPeriodo', () => {
    it('solo administrador y planificador pueden cambiar estados', () => {
      const resCoord = validarTransicionEstadoPeriodo(
        EstadoPeriodoOferta.BORRADOR,
        EstadoPeriodoOferta.REGISTRO_OFERTAS,
        RolUsuario.COORDINADOR_PFG
      );
      expect(resCoord.valido).toBe(false);
      expect(resCoord.error).toContain('Solo la Administración o el Planificador');

      const resDocente = validarTransicionEstadoPeriodo(
        EstadoPeriodoOferta.BORRADOR,
        EstadoPeriodoOferta.REGISTRO_OFERTAS,
        RolUsuario.DOCENTE
      );
      expect(resDocente.valido).toBe(false);
    });

    it('permite transiciones secuenciales oficiales del flujo', () => {
      // 1. Borrador -> Registro de Ofertas
      expect(
        validarTransicionEstadoPeriodo(
          EstadoPeriodoOferta.BORRADOR,
          EstadoPeriodoOferta.REGISTRO_OFERTAS,
          RolUsuario.PLANIFICADOR
        ).valido
      ).toBe(true);

      // 2. Registro de Ofertas -> Oferta Aprobada
      expect(
        validarTransicionEstadoPeriodo(
          EstadoPeriodoOferta.REGISTRO_OFERTAS,
          EstadoPeriodoOferta.OFERTA_APROBADA,
          RolUsuario.ADMINISTRADOR
        ).valido
      ).toBe(true);

      // 3. Oferta Aprobada -> Activo / Publicada
      expect(
        validarTransicionEstadoPeriodo(
          EstadoPeriodoOferta.OFERTA_APROBADA,
          EstadoPeriodoOferta.ACTIVO,
          RolUsuario.PLANIFICADOR
        ).valido
      ).toBe(true);

      // 4. Activo -> Cerrado
      expect(
        validarTransicionEstadoPeriodo(
          EstadoPeriodoOferta.ACTIVO,
          EstadoPeriodoOferta.CERRADO,
          RolUsuario.ADMINISTRADOR
        ).valido
      ).toBe(true);
    });

    it('rechaza saltos inválidos en el ciclo de vida', () => {
      const resSalto = validarTransicionEstadoPeriodo(
        EstadoPeriodoOferta.BORRADOR,
        EstadoPeriodoOferta.ACTIVO,
        RolUsuario.PLANIFICADOR
      );
      expect(resSalto.valido).toBe(false);
      expect(resSalto.error).toContain('Transición de estado no permitida');
    });
  });

  describe('validarPrerrequisitosApertura', () => {
    it('aprueba cuando todos los catálogos institucionales están cargados', () => {
      const res = validarPrerrequisitosApertura({
        docentesActivos: 15,
        espaciosActivos: 10,
        unidadesCurricularesActivas: 40,
      });
      expect(res.listo).toBe(true);
      expect(res.detalles).toHaveLength(0);
    });

    it('rechaza y lista faltantes cuando no hay docentes o aulas cargadas', () => {
      const res = validarPrerrequisitosApertura({
        docentesActivos: 0,
        espaciosActivos: 0,
        unidadesCurricularesActivas: 25,
      });
      expect(res.listo).toBe(false);
      expect(res.detalles.some((d) => d.includes('docentes activos'))).toBe(true);
      expect(res.detalles.some((d) => d.includes('espacios físicos'))).toBe(true);
    });
  });
});
