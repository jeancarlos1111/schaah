import { describe, it, expect } from 'vitest';
import { ESPACIOS_NATURALES_SEDE_BOLIVAR } from '../../src/scripts/seedEspacios';
import { TipoEspacio } from '../../src/core/domain/enums';
import { normalizarNivelPiso, validarAccesoPiso } from '../../src/core/domain/rules/pisoRules';

describe('Catálogo Oficial de Espacios Naturales - Sede UBV Bolívar', () => {
  it('contiene exactamente las 7 aulas del 1er piso con pisoNivel = 1', () => {
    const esperadas = ['Aula 1-4', 'Aula 1-5', 'Aula 1-7', 'Aula 1-8', 'Aula 1-11', 'Aula 1-12', 'Aula 1-13'];
    const aulasPiso1 = ESPACIOS_NATURALES_SEDE_BOLIVAR.filter(
      (e) => e.tipo === TipoEspacio.AULA_TEORICA && e.pisoNivel === 1
    );
    expect(aulasPiso1.map((a) => a.nombre)).toEqual(esperadas);
    for (const a of aulasPiso1) {
      expect(a.piso).toBe('Piso 1');
      expect(normalizarNivelPiso(a.piso)).toBe(1);
      expect(validarAccesoPiso(0, a.pisoNivel)).toBe(false);
      expect(validarAccesoPiso(1, a.pisoNivel)).toBe(true);
    }
  });

  it('contiene exactamente las 17 aulas del 2do piso con pisoNivel = 2', () => {
    const esperadas = [
      'Aula 2-1',
      'Aula 2-2',
      'Aula 2-3',
      'Aula 2-4',
      'Aula 2-5',
      'Aula 2-6',
      'Aula 2-7',
      'Aula 2-8',
      'Aula 2-9',
      'Aula 2-10',
      'Aula 2-11',
      'Aula 2-12',
      'Aula 2-13',
      'Aula 2-14',
      'Aula 2-15',
      'Aula 2-16',
      'Aula 2-18',
    ];
    const aulasPiso2 = ESPACIOS_NATURALES_SEDE_BOLIVAR.filter(
      (e) => e.tipo === TipoEspacio.AULA_TEORICA && e.pisoNivel === 2
    );
    expect(aulasPiso2.map((a) => a.nombre)).toEqual(esperadas);
    for (const a of aulasPiso2) {
      expect(a.piso).toBe('Piso 2');
      expect(normalizarNivelPiso(a.piso)).toBe(2);
      expect(validarAccesoPiso(1, a.pisoNivel)).toBe(false);
      expect(validarAccesoPiso(2, a.pisoNivel)).toBe(true);
    }
  });

  it('contiene exactamente las 14 aulas del 3er piso con pisoNivel = 3', () => {
    const esperadas = [
      'Aula 3-18',
      'Aula 3-19',
      'Aula 3-21',
      'Aula 3-23',
      'Aula 3-25',
      'Aula 3-28',
      'Aula 3-29',
      'Aula 3-30',
      'Aula 3-31',
      'Aula 3-32',
      'Aula 3-33',
      'Aula 3-34',
      'Aula 3-35',
      'Aula 3-36',
    ];
    const aulasPiso3 = ESPACIOS_NATURALES_SEDE_BOLIVAR.filter(
      (e) => e.tipo === TipoEspacio.AULA_TEORICA && e.pisoNivel === 3
    );
    expect(aulasPiso3.map((a) => a.nombre)).toEqual(esperadas);
    for (const a of aulasPiso3) {
      expect(a.piso).toBe('Piso 3');
      expect(normalizarNivelPiso(a.piso)).toBe(3);
      expect(validarAccesoPiso(2, a.pisoNivel)).toBe(false);
      expect(validarAccesoPiso(3, a.pisoNivel)).toBe(true);
    }
  });

  it('contiene los 2 talleres de Arquitectura y los 3 laboratorios de Informática', () => {
    const talleres = ESPACIOS_NATURALES_SEDE_BOLIVAR.filter((e) => e.tipo === TipoEspacio.TALLER);
    expect(talleres.map((t) => t.nombre)).toEqual(['Taller Arquitectura 1', 'Taller Arquitectura 2']);

    const labs = ESPACIOS_NATURALES_SEDE_BOLIVAR.filter((e) => e.tipo === TipoEspacio.LABORATORIO_INFORMATICA);
    expect(labs.map((l) => l.nombre)).toEqual(['Laboratorio #2', 'Laboratorio #11', 'Laboratorio #12']);
  });

  it('garantiza códigos únicos para los 43 espacios naturales de la Sede UBV Bolívar', () => {
    expect(ESPACIOS_NATURALES_SEDE_BOLIVAR).toHaveLength(43);
    const codigos = new Set(ESPACIOS_NATURALES_SEDE_BOLIVAR.map((e) => e.codigo));
    expect(codigos.size).toBe(43);
  });
});

