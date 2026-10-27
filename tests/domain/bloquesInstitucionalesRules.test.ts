import { describe, it, expect } from 'vitest';
import {
  clasificarLiderazgo,
  esFranjaReservaMartes,
  validarH13ReservaMartes,
  validarH14BloqueFijoLiderazgo,
} from '../../src/core/domain/rules/bloquesInstitucionalesRules';
import { validarAsignacionHoraria } from '../../src/core/domain/rules/validadorHorarioService';
import { PropuestaConSede } from '../../src/core/domain/rules/trasladoSedeRules';

describe('Reglas de Bloques Institucionales Fijos (M9: H-13 y H-14)', () => {
  describe('Clasificación de Unidades Curriculares de Liderazgo', () => {
    it('identifica variantes de Liderazgo I', () => {
      expect(clasificarLiderazgo('Liderazgo Productivo I')).toBe('LIDERAZGO_1');
      expect(clasificarLiderazgo('Liderazgo 1')).toBe('LIDERAZGO_1');
      expect(clasificarLiderazgo('LIDERAZGO I')).toBe('LIDERAZGO_1');
      expect(clasificarLiderazgo('Formación General', 'LP-I')).toBe('LIDERAZGO_1');
      expect(clasificarLiderazgo('Taller de Liderazgo')).toBe('LIDERAZGO_1');
    });

    it('identifica variantes de Liderazgo II', () => {
      expect(clasificarLiderazgo('Liderazgo Productivo II')).toBe('LIDERAZGO_2');
      expect(clasificarLiderazgo('Liderazgo 2')).toBe('LIDERAZGO_2');
      expect(clasificarLiderazgo('LIDERAZGO II')).toBe('LIDERAZGO_2');
      expect(clasificarLiderazgo('Formación General', 'LP-II')).toBe('LIDERAZGO_2');
    });

    it('retorna null para materias regulares', () => {
      expect(clasificarLiderazgo('Matemática I', 'MAT-101')).toBeNull();
      expect(clasificarLiderazgo('Algorítmica y Programación')).toBeNull();
      expect(clasificarLiderazgo('Proyecto Comunitario I')).toBeNull();
    });
  });

  describe('H-13: Reserva Institucional de los Martes (Horas 5 y 6: 10:45 AM - 12:15 PM)', () => {
    it('detecta solapamiento con la reserva institucional del martes', () => {
      expect(esFranjaReservaMartes('MARTES', '10:45', '12:15')).toBe(true);
      expect(esFranjaReservaMartes('martes', '11:00', '12:00')).toBe(true);
      expect(esFranjaReservaMartes('MARTES', '07:30', '09:00')).toBe(false);
      expect(esFranjaReservaMartes('MIERCOLES', '10:45', '12:15')).toBe(false);
    });

    it('rechaza con conflicto H-13 cualquier propuesta en la franja del martes 10:45 AM - 12:15 PM', () => {
      const res = validarH13ReservaMartes({
        dia: 'MARTES',
        horaInicio: '10:45',
        horaFin: '12:15',
      });
      expect(res.valido).toBe(false);
      expect(res.codigoRegla).toBe('H-13');
      expect(res.mensaje).toContain('Conflicto H-13');
      expect(res.mensaje).toContain('reuniones de Dirección, PFG, PIU');
    });

    it('acepta clases el martes en franjas distintas a la reservada', () => {
      const res = validarH13ReservaMartes({
        dia: 'MARTES',
        horaInicio: '07:30',
        horaFin: '09:00',
      });
      expect(res.valido).toBe(true);
    });
  });

  describe('H-14: Bloque Fijo Institucional para Liderazgo (Jueves)', () => {
    it('exige que Liderazgo 1 se dicte el JUEVES en Bloque 1 (07:30 AM - 09:00 AM)', () => {
      // Fuera de día
      const fueraDia = validarH14BloqueFijoLiderazgo({
        dia: 'LUNES',
        horaInicio: '07:30',
        horaFin: '09:00',
        unidadCurricularNombre: 'Liderazgo 1',
      });
      expect(fueraDia.valido).toBe(false);
      expect(fueraDia.codigoRegla).toBe('H-14');
      expect(fueraDia.mensaje).toContain('Liderazgo 1 debe programarse exclusivamente los días JUEVES en el Bloque 1');

      // Mismo día pero en otro bloque (ej. Bloque 2)
      const fueraBloque = validarH14BloqueFijoLiderazgo({
        dia: 'JUEVES',
        horaInicio: '09:05',
        horaFin: '10:35',
        unidadCurricularNombre: 'Liderazgo 1',
      });
      expect(fueraBloque.valido).toBe(false);
      expect(fueraBloque.mensaje).toContain('Bloque 1');

      // Válido en Jueves Bloque 1
      const valido = validarH14BloqueFijoLiderazgo({
        dia: 'JUEVES',
        horaInicio: '07:30',
        horaFin: '09:00',
        unidadCurricularNombre: 'Liderazgo 1',
      });
      expect(valido.valido).toBe(true);
    });

    it('exige que Liderazgo 2 se dicte el JUEVES en Bloque 2 (09:05 AM - 10:35 AM)', () => {
      // En bloque 1 (pertenece a Liderazgo 1)
      const enBloque1 = validarH14BloqueFijoLiderazgo({
        dia: 'JUEVES',
        horaInicio: '07:30',
        horaFin: '09:00',
        unidadCurricularNombre: 'Liderazgo 2',
      });
      expect(enBloque1.valido).toBe(false);
      expect(enBloque1.codigoRegla).toBe('H-14');
      expect(enBloque1.mensaje).toContain('Liderazgo 2 debe programarse exclusivamente los días JUEVES en el Bloque 2');

      // Válido en Jueves Bloque 2
      const valido = validarH14BloqueFijoLiderazgo({
        dia: 'JUEVES',
        horaInicio: '09:05',
        horaFin: '10:35',
        unidadCurricularNombre: 'Liderazgo Productivo II',
      });
      expect(valido.valido).toBe(true);
    });

    it('valida que el docente asignado a Liderazgo tenga JUEVES entre sus 3 días acordados', () => {
      const docenteSinJueves = validarH14BloqueFijoLiderazgo({
        dia: 'JUEVES',
        horaInicio: '07:30',
        horaFin: '09:00',
        unidadCurricularNombre: 'Liderazgo 1',
        diasPermitidosDocente: ['LUNES', 'MARTES', 'VIERNES'],
      });
      expect(docenteSinJueves.valido).toBe(false);
      expect(docenteSinJueves.mensaje).toContain('debe tener el día JUEVES incluido entre sus días de trabajo');

      const docenteConJueves = validarH14BloqueFijoLiderazgo({
        dia: 'JUEVES',
        horaInicio: '07:30',
        horaFin: '09:00',
        unidadCurricularNombre: 'Liderazgo 1',
        diasPermitidosDocente: ['LUNES', 'MARTES', 'JUEVES'],
      });
      expect(docenteConJueves.valido).toBe(true);
    });

    it('no aplica restricciones de Liderazgo a materias regulares', () => {
      const regular = validarH14BloqueFijoLiderazgo({
        dia: 'VIERNES',
        horaInicio: '14:05',
        horaFin: '15:35',
        unidadCurricularNombre: 'Bases de Datos',
      });
      expect(regular.valido).toBe(true);
    });
  });

  describe('Integración con validarAsignacionHoraria', () => {
    it('rechaza propuesta en martes 10:45 AM - 12:15 PM por conflicto H-13', () => {
      const propuesta: PropuestaConSede = {
        seccionId: 'sec-1',
        profesorId: 'prof-1',
        espacioFisicoId: 'aula-1',
        sedeId: 'sede-1',
        dia: 'MARTES',
        horaInicio: '10:45',
        horaFin: '12:15',
        unidadCurricularNombre: 'Ecología Política',
      };

      const res = validarAsignacionHoraria(propuesta, []);
      expect(res.esValido).toBe(false);
      expect(res.conflictos.some((c) => c.codigoRegla === 'H-13')).toBe(true);
      expect(res.mensajeResumen).toContain('Conflicto H-13');
    });

    it('rechaza asignación de Liderazgo 1 en día distinto a Jueves por conflicto H-14', () => {
      const propuesta: PropuestaConSede = {
        seccionId: 'sec-2',
        profesorId: 'prof-2',
        espacioFisicoId: 'aula-2',
        sedeId: 'sede-1',
        dia: 'LUNES',
        horaInicio: '07:30',
        horaFin: '09:00',
        unidadCurricularNombre: 'Liderazgo Productivo I',
      };

      const res = validarAsignacionHoraria(propuesta, []);
      expect(res.esValido).toBe(false);
      expect(res.conflictos.some((c) => c.codigoRegla === 'H-14')).toBe(true);
      expect(res.mensajeResumen).toContain('Conflicto H-14');
    });
  });
});
