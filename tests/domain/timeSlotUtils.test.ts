import { describe, it, expect } from 'vitest';
import {
  to12HourFormat,
  to24HourFormat,
  timeToMinutes,
  minutesToTime24,
  rangosSeSolapan,
  calcularBrechaMinutos,
} from '../../src/core/domain/rules/timeSlotUtils';

describe('Utilidades de Tiempo y Formato Civil Venezolano (timeSlotUtils)', () => {
  describe('to12HourFormat', () => {
    it('debe convertir horas matutinas a formato con sufijo AM', () => {
      expect(to12HourFormat('07:30')).toBe('07:30 AM');
      expect(to12HourFormat('09:05')).toBe('09:05 AM');
      expect(to12HourFormat('11:45')).toBe('11:45 AM');
    });

    it('debe manejar las 12 del mediodía correctamente como 12:00 PM', () => {
      expect(to12HourFormat('12:00')).toBe('12:00 PM');
      expect(to12HourFormat('12:30')).toBe('12:30 PM');
    });

    it('debe convertir horas vespertinas y nocturnas a formato 12h con sufijo PM', () => {
      expect(to12HourFormat('14:00')).toBe('02:00 PM');
      expect(to12HourFormat('17:15')).toBe('05:15 PM');
      expect(to12HourFormat('21:00')).toBe('09:00 PM');
    });

    it('debe manejar la medianoche 00:00 como 12:00 AM', () => {
      expect(to12HourFormat('00:00')).toBe('12:00 AM');
    });
  });

  describe('to24HourFormat', () => {
    it('debe convertir de 12h civil a 24h militar', () => {
      expect(to24HourFormat('07:30 AM')).toBe('07:30');
      expect(to24HourFormat('12:30 PM')).toBe('12:30');
      expect(to24HourFormat('02:00 PM')).toBe('14:00');
      expect(to24HourFormat('09:00 PM')).toBe('21:00');
      expect(to24HourFormat('12:00 AM')).toBe('00:00');
    });
  });

  describe('timeToMinutes y minutesToTime24', () => {
    it('debe calcular los minutos acumulados correctamente', () => {
      expect(timeToMinutes('00:00')).toBe(0);
      expect(timeToMinutes('01:30')).toBe(90);
      expect(timeToMinutes('07:30')).toBe(450);
      expect(timeToMinutes('14:00')).toBe(840);
    });

    it('debe reconstruir cadena 24h desde minutos acumulados', () => {
      expect(minutesToTime24(450)).toBe('07:30');
      expect(minutesToTime24(840)).toBe('14:00');
    });
  });

  describe('rangosSeSolapan', () => {
    it('debe detectar solapamiento total y parcial', () => {
      // Caso idéntico
      expect(rangosSeSolapan('07:30', '09:00', '07:30', '09:00')).toBe(true);
      // Caso que se cruza por la mitad
      expect(rangosSeSolapan('07:30', '09:00', '08:00', '10:00')).toBe(true);
      // Caso contenido dentro de otro
      expect(rangosSeSolapan('07:30', '11:00', '08:00', '09:30')).toBe(true);
    });

    it('debe indicar que bloques contiguos NO se solapan (finA === inicioB)', () => {
      expect(rangosSeSolapan('07:30', '09:00', '09:00', '10:30')).toBe(false);
      expect(rangosSeSolapan('09:00', '10:30', '07:30', '09:00')).toBe(false);
    });

    it('debe indicar que bloques separados NO se solapan', () => {
      expect(rangosSeSolapan('07:30', '09:00', '12:30', '14:00')).toBe(false);
    });
  });

  describe('calcularBrechaMinutos', () => {
    it('debe calcular la diferencia en minutos entre el fin de un bloque y el inicio de otro', () => {
      expect(calcularBrechaMinutos('09:00', '10:30')).toBe(90);
      expect(calcularBrechaMinutos('09:00', '09:05')).toBe(5);
      expect(calcularBrechaMinutos('12:00', '13:30')).toBe(90);
    });
  });
});
