import { describe, it, expect } from 'vitest';
import { Turno } from '../../src/core/domain/enums';
import {
  HORAS_ACADEMICAS_40MIN,
  DIAS_FORMATO_OFICIAL,
  obtenerHoras40MinPorTurno,
} from '../../src/core/domain/rules/timeSlotUtils';
import {
  construirGrillaFormatoOficial,
  formatearEtiquetaEspacioOficial,
  formatearPeriodoOficial,
  LEMA_UBV_OFICIAL,
  EJE_GEOPOLITICO_OFICIAL,
} from '../../src/core/domain/rules/formatoHorarioOficial';

describe('Formato Oficial de Horarios UBV Bolívar (40 min, Lunes a Domingo)', () => {
  it('define las 6 horas matutinas de 40 minutos exactas (8:00 a 12:00)', () => {
    const matutinas = obtenerHoras40MinPorTurno(Turno.MATUTINO);
    expect(matutinas).toHaveLength(6);
    expect(matutinas.map((h) => h.etiquetaRango)).toEqual([
      '8:00 - 8:40',
      '8:40 - 9:20',
      '9:20 - 10:00',
      '10:00 - 10:40',
      '10:40 - 11:20',
      '11:20 - 12:00',
    ]);
    expect(HORAS_ACADEMICAS_40MIN.length).toBeGreaterThanOrEqual(16);
    expect(DIAS_FORMATO_OFICIAL).toEqual([
      'LUNES',
      'MARTES',
      'MIERCOLES',
      'JUEVES',
      'VIERNES',
      'SABADO',
      'DOMINGO',
    ]);
  });

  it('formatea el código del período académico al estilo oficial (2026-II -> PERIODO ACADÉMICO 2026-2)', () => {
    expect(formatearPeriodoOficial('2026-II')).toBe('PERIODO ACADÉMICO 2026-2');
    expect(formatearPeriodoOficial('2026-I')).toBe('PERIODO ACADÉMICO 2026-1');
    expect(LEMA_UBV_OFICIAL).toBe('"PROFESIONALES LIDERES DEL SOCIALISMO"');
    expect(EJE_GEOPOLITICO_OFICIAL).toBe('EJE GEOPOLÍTICO REGIONAL SALTO KEREPAKUPAIVENA');
  });

  it('formatea la etiqueta de aula y de Proyecto / Comunidad / Institución igual al reporte UBV', () => {
    expect(
      formatearEtiquetaEspacioOficial({
        dia: 'LUNES',
        horaInicio: '07:30',
        unidadNombre: 'Algoritmos Y Programación',
        profesorNombre: 'Osmando Marín',
        espacioNombre: 'Aula 1-4',
      })
    ).toBe('Aula 1-4');

    expect(
      formatearEtiquetaEspacioOficial({
        dia: 'MIERCOLES',
        horaInicio: '07:30',
        unidadNombre: 'Proyecto I',
        profesorNombre: 'María Bucarito',
        espacioNombre: 'Aula 1-11',
        esProyectoComunitario: true,
      })
    ).toBe('Aula 1-11,U.B.V.\nComunidad\nInstitución');

    expect(
      formatearEtiquetaEspacioOficial({
        dia: 'MIERCOLES',
        horaInicio: '07:30',
        unidadNombre: 'Proyecto IV',
        profesorNombre: 'Yamileth Ledezma',
        espacioNombre: 'Sin Aula (Campo)',
        esProyectoComunitario: true,
      })
    ).toBe('U.B.V. /Comunidad\nInstitución');
  });

  it('fusiona verticalmente (rowSpan) los bloques contiguos de la misma materia en la grilla de 6 horas de 40 min', () => {
    const grilla = construirGrillaFormatoOficial(
      [
        // Bloque 1 (2 horas de 40m: 8:00-8:40 y 8:40-9:20)
        {
          dia: 'LUNES',
          horaInicio: '07:30',
          unidadNombre: 'Algoritmos Y Programación',
          profesorNombre: 'Osmando Marín',
          espacioNombre: 'Aula 1-4',
          codigoSeccion: 'KV-BO-RC-01-ALG',
        },
        // Proyecto I ocupando los 3 bloques matutinos del miércoles (6 horas de 40m: 8:00 a 12:00)
        {
          dia: 'MIERCOLES',
          horaInicio: '07:30',
          unidadNombre: 'Proyecto I',
          profesorNombre: 'María Bucarito',
          espacioNombre: 'Aula 1-11',
          codigoSeccion: 'KV-BO-RC-01-PROY1',
          esProyectoComunitario: true,
        },
        {
          dia: 'MIERCOLES',
          horaInicio: '09:05',
          unidadNombre: 'Proyecto I',
          profesorNombre: 'María Bucarito',
          espacioNombre: 'Aula 1-11',
          codigoSeccion: 'KV-BO-RC-01-PROY1',
          esProyectoComunitario: true,
        },
        {
          dia: 'MIERCOLES',
          horaInicio: '10:45',
          unidadNombre: 'Proyecto I',
          profesorNombre: 'María Bucarito',
          espacioNombre: 'Aula 1-11',
          codigoSeccion: 'KV-BO-RC-01-PROY1',
          esProyectoComunitario: true,
        },
      ],
      Turno.MATUTINO
    );

    expect(grilla).toHaveLength(6);

    // Lunes: fila 0 (8:00 - 8:40) tiene rowSpan = 2; fila 1 (8:40 - 9:20) queda oculta por fusión
    expect(grilla[0].celdasPorDia.LUNES.ocupada).toBe(true);
    expect(grilla[0].celdasPorDia.LUNES.rowSpan).toBe(2);
    expect(grilla[0].celdasPorDia.LUNES.materiaNombre).toBe('Algoritmos Y Programación');
    expect(grilla[0].celdasPorDia.LUNES.profesorNombre).toBe('Osmando Marín');
    expect(grilla[0].celdasPorDia.LUNES.aulaEtiqueta).toBe('Aula 1-4');
    expect(grilla[1].celdasPorDia.LUNES.ocultaPorFusion).toBe(true);
    expect(grilla[2].celdasPorDia.LUNES.ocupada).toBe(false);

    // Miércoles: Proyecto I fusiona las 6 filas completas (8:00 a 12:00) con rowSpan = 6
    expect(grilla[0].celdasPorDia.MIERCOLES.ocupada).toBe(true);
    expect(grilla[0].celdasPorDia.MIERCOLES.rowSpan).toBe(6);
    expect(grilla[0].celdasPorDia.MIERCOLES.materiaNombre).toBe('Proyecto I');
    expect(grilla[0].celdasPorDia.MIERCOLES.profesorNombre).toBe('María Bucarito');
    expect(grilla[0].celdasPorDia.MIERCOLES.aulaEtiqueta).toContain('Aula 1-11,U.B.V.');
    for (let r = 1; r < 6; r++) {
      expect(grilla[r].celdasPorDia.MIERCOLES.ocultaPorFusion).toBe(true);
    }
  });
});

