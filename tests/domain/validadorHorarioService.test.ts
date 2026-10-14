import { describe, it, expect } from 'vitest';
import {
  validarAsignacionHoraria,
  DisponibilidadDocenteItem,
} from '../../src/core/domain/rules/validadorHorarioService';
import {
  BloqueHorarioExistente,
} from '../../src/core/domain/rules/horarioConflictRules';
import { PropuestaConSede } from '../../src/core/domain/rules/trasladoSedeRules';

describe('Validador Orquestador de Reglas de Dominio UBV (H-01 a H-09)', () => {
  const bloquesExistentes: BloqueHorarioExistente[] = [
    {
      id: 'bloque-1',
      seccionId: 'sec-inf-01',
      codigoSeccion: 'INFO-101',
      unidadCurricularNombre: 'Algorítmica y Programación',
      profesorId: 'prof-carlos',
      profesorNombre: 'Carlos Gómez',
      espacioFisicoId: 'aula-101',
      espacioFisicoNombre: 'Aula 101',
      sedeId: 'sede-germania',
      sedeNombre: 'Sede Germania (Ciudad Bolívar)',
      dia: 'LUNES',
      horaInicio: '07:30',
      horaFin: '09:00',
    },
    {
      id: 'bloque-2',
      seccionId: 'sec-com-02',
      codigoSeccion: 'COM-201',
      unidadCurricularNombre: 'Teoría de la Comunicación',
      profesorId: 'prof-maria',
      profesorNombre: 'María Pérez',
      espacioFisicoId: 'lab-comp-1',
      espacioFisicoNombre: 'Laboratorio de Computación 1',
      sedeId: 'sede-germania',
      sedeNombre: 'Sede Germania (Ciudad Bolívar)',
      dia: 'LUNES',
      horaInicio: '09:05',
      horaFin: '10:35',
    },
  ];

  describe('H-01: No Solapamiento Docente', () => {
    it('debe rechazar cuando el mismo profesor tiene otra clase simultánea el mismo día', () => {
      const propuesta: PropuestaConSede = {
        seccionId: 'sec-otra',
        profesorId: 'prof-carlos',
        espacioFisicoId: 'aula-102',
        sedeId: 'sede-germania',
        dia: 'LUNES',
        horaInicio: '08:00',
        horaFin: '09:30',
      };

      const resultado = validarAsignacionHoraria(propuesta, bloquesExistentes);
      expect(resultado.esValido).toBe(false);
      expect(resultado.conflictos.some((c) => c.codigoRegla === 'H-01')).toBe(true);
      expect(resultado.mensajeResumen).toContain('Conflicto H-01: El docente (Carlos Gómez) ya tiene clase asignada');
    });

    it('debe aprobar si el mismo docente tiene clases en bloques contiguos sin solapamiento', () => {
      const propuesta: PropuestaConSede = {
        seccionId: 'sec-otra',
        profesorId: 'prof-carlos',
        espacioFisicoId: 'aula-102',
        sedeId: 'sede-germania',
        dia: 'LUNES',
        horaInicio: '09:05',
        horaFin: '10:35',
      };

      const resultado = validarAsignacionHoraria(propuesta, bloquesExistentes);
      expect(resultado.esValido).toBe(true);
      expect(resultado.conflictos.length).toBe(0);
    });
  });

  describe('H-02: No Solapamiento de Aula / Espacio Físico', () => {
    it('debe rechazar cuando otro docente intenta ocupar el mismo espacio en la misma franja', () => {
      const propuesta: PropuestaConSede = {
        seccionId: 'sec-otra',
        profesorId: 'prof-nuevo',
        espacioFisicoId: 'aula-101', // Ya ocupada por bloque-1
        sedeId: 'sede-germania',
        dia: 'LUNES',
        horaInicio: '07:30',
        horaFin: '09:00',
      };

      const resultado = validarAsignacionHoraria(propuesta, bloquesExistentes);
      expect(resultado.esValido).toBe(false);
      expect(resultado.conflictos.some((c) => c.codigoRegla === 'H-02')).toBe(true);
      expect(resultado.mensajeResumen).toContain('Conflicto H-02: El aula física [Aula 101] ya está ocupada');
    });
  });

  describe('H-03: No Solapamiento de Sección Estudiantil', () => {
    it('debe rechazar cuando la misma sección es asignada a dos materias a la misma hora', () => {
      const propuesta: PropuestaConSede = {
        seccionId: 'sec-inf-01', // Ya tiene bloque-1
        profesorId: 'prof-otro',
        espacioFisicoId: 'aula-105',
        sedeId: 'sede-germania',
        dia: 'LUNES',
        horaInicio: '07:30',
        horaFin: '09:00',
      };

      const resultado = validarAsignacionHoraria(propuesta, bloquesExistentes);
      expect(resultado.esValido).toBe(false);
      expect(resultado.conflictos.some((c) => c.codigoRegla === 'H-03')).toBe(true);
      expect(resultado.mensajeResumen).toContain('Conflicto H-03: Los estudiantes de la sección ya tienen programada');
    });
  });

  describe('H-08: Adecuación de Espacio (Proyecto Comunitario sin aula física)', () => {
    it('debe validar exitosamente cuando Proyecto Comunitario no tiene espacio físico asignado', () => {
      const propuesta: PropuestaConSede = {
        seccionId: 'sec-proy-01',
        profesorId: 'prof-nuevo',
        espacioFisicoId: null,
        esProyectoComunitario: true,
        sedeId: 'sede-germania',
        dia: 'MARTES',
        horaInicio: '07:30',
        horaFin: '10:35',
      };

      const resultado = validarAsignacionHoraria(propuesta, bloquesExistentes);
      expect(resultado.esValido).toBe(true);
      expect(resultado.conflictos.length).toBe(0);
    });

    it('debe rechazar si a una unidad de Proyecto Comunitario se le intenta asignar aula física universitaria', () => {
      const propuesta: PropuestaConSede = {
        seccionId: 'sec-proy-01',
        profesorId: 'prof-nuevo',
        espacioFisicoId: 'aula-101', // Proyecto no debe reservar aula
        esProyectoComunitario: true,
        sedeId: 'sede-germania',
        dia: 'MARTES',
        horaInicio: '07:30',
        horaFin: '10:35',
      };

      const resultado = validarAsignacionHoraria(propuesta, bloquesExistentes);
      expect(resultado.esValido).toBe(false);
      expect(resultado.conflictos.some((c) => c.codigoRegla === 'H-08')).toBe(true);
      expect(resultado.mensajeResumen).toContain('Conflicto H-08: La unidad curricular es Proyecto Comunitario (trabajo de campo). No debe reservar aula física');
    });
  });

  describe('H-09: Antiteletransportación Territorial (Mínimo 90 min entre sedes)', () => {
    it('debe rechazar si el docente tiene clase en otra sede sin intervalo de al menos 90 min para viaje', () => {
      // Bloque existente del prof-carlos termina a las 09:00 en 'sede-germania'
      // Nueva clase en 'aldea-caroni' inicia a las 09:30 (brecha = 30 min < 90 min)
      const propuesta: PropuestaConSede = {
        seccionId: 'sec-distante',
        profesorId: 'prof-carlos',
        espacioFisicoId: 'aula-caroni-1',
        sedeId: 'aldea-caroni',
        sedeNombre: 'Aldea Caroní (Puerto Ordaz)',
        dia: 'LUNES',
        horaInicio: '09:30',
        horaFin: '11:00',
      };

      const resultado = validarAsignacionHoraria(propuesta, bloquesExistentes);
      expect(resultado.esValido).toBe(false);
      expect(resultado.conflictos.some((c) => c.codigoRegla === 'H-09')).toBe(true);
      expect(resultado.mensajeResumen).toContain('Antiteletransportación');
    });

    it('debe aceptar si la brecha entre sedes es de 90 minutos o más', () => {
      // Bloque existente termina 09:00 en 'sede-germania'.
      // Nueva clase en 'aldea-caroni' inicia a las 10:35 (brecha = 95 min >= 90 min)
      const propuesta: PropuestaConSede = {
        seccionId: 'sec-distante',
        profesorId: 'prof-carlos',
        espacioFisicoId: 'aula-caroni-1',
        sedeId: 'aldea-caroni',
        sedeNombre: 'Aldea Caroní (Puerto Ordaz)',
        dia: 'LUNES',
        horaInicio: '10:35',
        horaFin: '12:05',
      };

      const resultado = validarAsignacionHoraria(propuesta, bloquesExistentes);
      expect(resultado.esValido).toBe(true);
    });
  });

  describe('H-06: Disponibilidad Docente Vinculante', () => {
    it('debe rechazar si el docente declaró la franja como NO disponible', () => {
      const disponibilidades: DisponibilidadDocenteItem[] = [
        {
          profesorId: 'prof-carlos',
          dia: 'MIERCOLES',
          horaInicio: '07:30',
          horaFin: '09:00',
          disponible: false,
          prioridadPreferencia: 0,
        },
      ];

      const propuesta: PropuestaConSede = {
        seccionId: 'sec-otra',
        profesorId: 'prof-carlos',
        espacioFisicoId: 'aula-101',
        sedeId: 'sede-germania',
        dia: 'MIERCOLES',
        horaInicio: '07:30',
        horaFin: '09:00',
      };

      const resultado = validarAsignacionHoraria(propuesta, bloquesExistentes, disponibilidades);
      expect(resultado.esValido).toBe(false);
      expect(resultado.conflictos.some((c) => c.codigoRegla === 'H-06')).toBe(true);
      expect(resultado.mensajeResumen).toContain('NO DISPONIBLE');
    });
  });
});
