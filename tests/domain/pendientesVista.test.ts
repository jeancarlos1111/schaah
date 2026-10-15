import { describe, expect, it } from 'vitest';
import { pendientesDeVista } from '../../src/modules/horarios/pendientesVista';

const sec = (id: string, over: Partial<{ profesorId: string | null; grupoId: string | null; sedeId: string; horarios: unknown[] }> = {}) => ({
  id,
  profesorId: null,
  grupoId: null,
  sedeId: 'SEDE',
  horarios: [] as unknown[],
  ...over,
});

describe('Matriz de horarios: asignaciones "Por Programar" según la vista activa', () => {
  const secciones = [
    sec('s1', { profesorId: 'maria', grupoId: 'rc01', sedeId: 'SEDE' }),
    sec('s2', { profesorId: 'maria', grupoId: 'cn02', sedeId: 'GOSH' }),
    sec('s3', { profesorId: 'jose', grupoId: 'rc01', sedeId: 'SEDE', horarios: [{ dia: 'LUNES' }] }),
    sec('s4', { profesorId: null, grupoId: 'rc01', sedeId: 'SEDE' }),
    sec('s5', { profesorId: 'jose', grupoId: 'cn02', sedeId: 'GOSH' }),
  ];
  const espacios = [
    { id: 'aula-sede', sedeId: 'SEDE' },
    { id: 'aula-gosh', sedeId: 'GOSH' },
  ];
  const ids = (lista: { id: string }[]) => lista.map((s) => s.id);

  it('excluye siempre las asignaciones que ya tienen bloques en la matriz', () => {
    expect(ids(pendientesDeVista(secciones, 'DOCENTE', ''))).toEqual(['s1', 's2', 's4', 's5']);
  });

  it('por docente muestra solo sus UC pendientes', () => {
    expect(ids(pendientesDeVista(secciones, 'DOCENTE', 'maria'))).toEqual(['s1', 's2']);
    expect(ids(pendientesDeVista(secciones, 'DOCENTE', 'jose'))).toEqual(['s5']);
  });

  it('por asignación muestra solo esa asignación si está pendiente', () => {
    expect(ids(pendientesDeVista(secciones, 'SECCION', 's4'))).toEqual(['s4']);
    expect(ids(pendientesDeVista(secciones, 'SECCION', 's3'))).toEqual([]);
  });

  it('por cohorte muestra las UC pendientes del grupo, incluidas las vacantes', () => {
    expect(ids(pendientesDeVista(secciones, 'GRUPO', 'rc01'))).toEqual(['s1', 's4']);
  });

  it('por aula muestra las asignaciones de la sede donde está el aula', () => {
    expect(ids(pendientesDeVista(secciones, 'AULA', 'aula-gosh', espacios))).toEqual(['s2', 's5']);
    expect(ids(pendientesDeVista(secciones, 'AULA', 'aula-sede', espacios))).toEqual(['s1', 's4']);
    expect(ids(pendientesDeVista(secciones, 'AULA', 'aula-desconocida', espacios))).toEqual(['s1', 's2', 's4', 's5']);
  });
});
