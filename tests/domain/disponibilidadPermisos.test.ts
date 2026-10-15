import { describe, expect, it } from 'vitest';
import { RolUsuario } from '../../src/core/domain/enums';
import { ALCANCE_TOTAL, alcanceDeUsuario } from '../../src/core/domain/rules/alcancePfgRules';
import {
  LONGITUD_MINIMA_MOTIVO,
  compararDisponibilidad,
  normalizarFranjas,
  permisoDisponibilidad,
  validarMotivo,
} from '../../src/core/domain/rules/disponibilidadPermisos';
import { formatearFechaHora12 } from '../../src/core/domain/rules/timeSlotUtils';

describe('Quién edita la disponibilidad de un docente (Spec 06)', () => {
  const alcanceCoordinador = alcanceDeUsuario(RolUsuario.COORDINADOR_PFG, ['PFG-INFO']);

  it('el docente edita solo la suya y sin motivo', () => {
    const docente = { rol: RolUsuario.DOCENTE, profesorIdPropio: 'carlos' };
    expect(permisoDisponibilidad(docente, 'carlos', [], ALCANCE_TOTAL)).toEqual({ permitido: true, requiereMotivo: false });
    expect(permisoDisponibilidad(docente, 'ana', [], ALCANCE_TOTAL).permitido).toBe(false);
    expect(permisoDisponibilidad({ rol: RolUsuario.DOCENTE, profesorIdPropio: null }, 'carlos', [], ALCANCE_TOTAL).permitido).toBe(false);
  });

  it('Administración y Dirección editan la de cualquier docente, siempre con motivo', () => {
    for (const rol of [RolUsuario.ADMINISTRADOR, RolUsuario.DIRECTOR_ACADEMICO]) {
      expect(permisoDisponibilidad({ rol }, 'ana', [], ALCANCE_TOTAL)).toEqual({ permitido: true, requiereMotivo: true });
    }
  });

  it('el coordinador solo edita la de docentes con asignaciones de sus programas, con motivo', () => {
    const coordinador = { rol: RolUsuario.COORDINADOR_PFG };
    expect(permisoDisponibilidad(coordinador, 'ana', ['PFG-SALUD', 'PFG-INFO'], alcanceCoordinador)).toEqual({
      permitido: true,
      requiereMotivo: true,
    });
    expect(permisoDisponibilidad(coordinador, 'ana', ['PFG-SALUD'], alcanceCoordinador).permitido).toBe(false);
    expect(permisoDisponibilidad(coordinador, 'ana', [], alcanceCoordinador).permitido).toBe(false);
    expect(
      permisoDisponibilidad(coordinador, 'ana', ['PFG-INFO'], alcanceDeUsuario(RolUsuario.COORDINADOR_PFG, [])).permitido
    ).toBe(false);
  });

  it('sin sesión o con un rol desconocido se deniega', () => {
    expect(permisoDisponibilidad(null, 'ana', [], ALCANCE_TOTAL).permitido).toBe(false);
    expect(permisoDisponibilidad({ rol: 'INVITADO' }, 'ana', [], ALCANCE_TOTAL).permitido).toBe(false);
  });
});

describe('Motivo del cambio', () => {
  it('se exige con un mínimo de caracteres cuando el cambio lo hace un tercero', () => {
    const error = `Indique el motivo del cambio (al menos ${LONGITUD_MINIMA_MOTIVO} caracteres): no se guardaron cambios.`;
    expect(validarMotivo(true, undefined)).toEqual({ valido: false, error });
    expect(validarMotivo(true, '   corto   ')).toEqual({ valido: false, error });
    expect(validarMotivo(true, '  Reposo   médico\n del docente ')).toEqual({ valido: true, motivo: 'Reposo médico del docente' });
  });

  it('es opcional para el propio docente y se guarda vacío como nulo', () => {
    expect(validarMotivo(false, '')).toEqual({ valido: true, motivo: null });
    expect(validarMotivo(false, 'Cambio de turno')).toEqual({ valido: true, motivo: 'Cambio de turno' });
  });
});

describe('Comparación de la disponibilidad antes y después', () => {
  const f = (dia: string, horaInicio: string, prioridad = 1, disponible = true) => ({
    dia,
    horaInicio,
    horaFin: horaInicio,
    prioridad,
    disponible,
  });

  it('normaliza: descarta las no disponibles, deja una por día y hora y ordena por día y hora', () => {
    expect(
      normalizarFranjas([f('MIERCOLES', '07:30'), f('LUNES', '09:10'), f('LUNES', '07:30', 1, false), f('LUNES', '09:10', 3)])
    ).toEqual([
      { dia: 'LUNES', horaInicio: '09:10', horaFin: '09:10', prioridad: 3 },
      { dia: 'MIERCOLES', horaInicio: '07:30', horaFin: '07:30', prioridad: 1 },
    ]);
  });

  it('detalla franjas agregadas, quitadas y cambios de prioridad en formato de 12 horas', () => {
    const resultado = compararDisponibilidad(
      [f('LUNES', '07:30'), f('MARTES', '13:30', 1), f('VIERNES', '15:10')],
      [f('LUNES', '07:30'), f('MARTES', '13:30', 2), f('JUEVES', '07:30'), f('SABADO', '09:10')]
    );
    expect(resultado.hayCambios).toBe(true);
    expect(resultado.agregadas).toEqual(['JUEVES 07:30 AM', 'SABADO 09:10 AM']);
    expect(resultado.quitadas).toEqual(['VIERNES 03:10 PM']);
    expect(resultado.cambiosPrioridad).toEqual([{ franja: 'MARTES 01:30 PM', antes: 1, despues: 2 }]);
    expect(resultado.resumen).toBe('2 franjas agregadas, 1 franja quitada, 1 cambio de prioridad');
  });

  it('sin diferencias reales (mismo contenido en otro orden o con franjas no disponibles) no hay cambios', () => {
    const resultado = compararDisponibilidad(
      [f('MARTES', '07:30', 2), f('LUNES', '07:30')],
      [f('LUNES', '07:30'), f('MARTES', '07:30', 2), f('MIERCOLES', '07:30', 1, false)]
    );
    expect(resultado).toEqual({ hayCambios: false, agregadas: [], quitadas: [], cambiosPrioridad: [], resumen: 'Sin cambios' });
  });

  it('vaciar la disponibilidad cuenta como franjas quitadas', () => {
    expect(compararDisponibilidad([f('LUNES', '07:30'), f('LUNES', '09:10')], []).resumen).toBe('2 franjas quitadas');
  });
});

describe('Fecha y hora del historial en formato civil venezolano', () => {
  it('usa día/mes/año y hora de 12 horas con AM/PM', () => {
    expect(formatearFechaHora12(new Date(2026, 9, 15, 12, 44))).toBe('15/10/2026 12:44 PM');
    expect(formatearFechaHora12(new Date(2026, 0, 5, 0, 7))).toBe('05/01/2026 12:07 AM');
    expect(formatearFechaHora12(new Date(2026, 11, 31, 19, 5))).toBe('31/12/2026 07:05 PM');
  });
});
