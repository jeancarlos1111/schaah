import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { DedicacionDocente } from '../../src/core/domain/enums';
import {
  COLUMNAS_INCONSISTENCIA,
  DocenteInconsistenciaInput,
  analizarInconsistenciasOferta,
  esTipoInconsistencia,
  generarLibroInconsistencias,
  paginarInconsistencias,
} from '../../src/modules/oferta/ofertaInconsistencias';

const asignaciones = (horas: number[]) =>
  horas.map((h, i) => ({
    codigoSeccion: `SEC-${i}`,
    horasSemanalesOferta: h,
    unidadCurricular: { horasTeoricasSemanales: 3, horasPracticasSemanales: 1 },
  }));

const docente = (over: Partial<DocenteInconsistenciaInput> & { cedula: string }): DocenteInconsistenciaInput => ({
  id: `id-${over.cedula}`,
  nombres: 'Nombre',
  apellidos: 'Apellido',
  dedicacion: DedicacionDocente.DEDICACION_EXCLUSIVA,
  asignaciones: [],
  ...over,
});

function reporteBase() {
  return analizarInconsistenciasOferta({
    docentes: [
      docente({ cedula: 'V-13017296', nombres: 'MARIA', apellidos: 'BLANCO', dedicacion: DedicacionDocente.TIEMPO_COMPLETO, asignaciones: asignaciones(Array(12).fill(4)) }),
      docente({ cedula: 'V-8894563', nombres: 'FELSON', apellidos: 'LUGO', asignaciones: asignaciones([12, 12, 12]) }),
      docente({ cedula: 'V-1', nombres: 'ÁNGEL', apellidos: 'PÉREZ', asignaciones: asignaciones([4, 4]) }),
      docente({ cedula: 'V-2', nombres: 'ROSA', apellidos: 'DÍAZ', dedicacion: DedicacionDocente.MEDIO_TIEMPO, asignaciones: [] }),
      docente({ cedula: 'V-3', nombres: 'LUIS', apellidos: 'MORA', dedicacion: null, asignaciones: asignaciones([6]) }),
      docente({ cedula: 'V-4', nombres: 'ANA', apellidos: 'RUIZ', dedicacion: null, asignaciones: [] }),
      docente({ cedula: 'V-5', nombres: 'EVA', apellidos: 'SOL', asignaciones: asignaciones([4, 4, 4, 2]) }),
    ],
    vacantes: [
      { id: 's2', codigoSeccion: 'KV-BO-RC-02-PIU-SC', grupoId: 'g2', grupoCodigo: 'KV-BO-RC-02', pfgCodigo: 'PIU', ucCodigo: 'PIU-SC', ucNombre: 'Seminario de Contexto', horas: 4, sedeNombre: 'Sede UBV Bolívar' },
      { id: 's1', codigoSeccion: 'KV-BO-RC-01-PIU-RP', grupoId: 'g1', grupoCodigo: 'KV-BO-RC-01', pfgCodigo: 'PIU', ucCodigo: 'PIU-RP', ucNombre: 'Recreando la Patria', horas: 2, sedeNombre: 'Aldea CVG-GOSH' },
    ],
    unidadesProvisionales: [{ id: 'u1', pfgCodigo: 'PIU', codigo: 'PIU-SC', nombre: 'SEMINARIO DE CONTEXTO', asignaciones: 7 }],
    ultimaImportacion: {
      fecha: new Date('2026-10-15T14:00:00Z'),
      nombreArchivo: 'CONSOLIDADO_OFERTA_2026_2.xlsx',
      usuarioNombre: 'Coordinación Académica',
      dedicacionesInconsistentes: [
        { cedula: 'V-1', nombre: 'ANGEL PEREZ', valores: [DedicacionDocente.DEDICACION_EXCLUSIVA, DedicacionDocente.TIEMPO_COMPLETO], aplicada: DedicacionDocente.DEDICACION_EXCLUSIVA },
        { cedula: 'V-99', nombre: 'SIN CARGA', valores: [DedicacionDocente.MEDIO_TIEMPO, DedicacionDocente.TIEMPO_CONVENCIONAL], aplicada: DedicacionDocente.MEDIO_TIEMPO },
      ],
    },
  });
}

describe('Inconsistencias de la oferta: clasificación', () => {
  const reporte = reporteBase();

  it('ordena las sobrecargas H-04 por exceso, con el caso real de 48 h y tope de 12 h primero', () => {
    expect(reporte.filas.sobrecargas.map((f) => [f.cedula, f.horas, f.maxHoras, f.exceso])).toEqual([
      ['V-13017296', 48, 12, 36],
      ['V-8894563', 36, 16, 20],
    ]);
    expect(reporte.filas.sobrecargas[0]).toMatchObject({ nombre: 'BLANCO, MARIA', dedicacion: 'Tiempo completo', asignaciones: 12 });
  });

  it('el déficit H-05 incluye a quien tiene dedicación y ninguna carga, y excluye a quien está en norma', () => {
    expect(reporte.filas.deficit.map((f) => [f.cedula, f.horas, f.minHoras, f.faltante])).toEqual([
      ['V-2', 0, 4, 4],
      ['V-1', 8, 12, 4],
    ]);
    const enNorma = [...reporte.filas.sobrecargas, ...reporte.filas.deficit].some((f) => f.cedula === 'V-5');
    expect(enNorma).toBe(false);
  });

  it('solo reporta "sin dedicación" a docentes que tienen carga en el período', () => {
    expect(reporte.filas['sin-dedicacion'].map((f) => f.cedula)).toEqual(['V-3']);
  });

  it('lista vacantes y códigos provisionales, y cruza la dedicación contradictoria con la actual', () => {
    expect(reporte.filas.vacantes.map((f) => f.codigoSeccion)).toEqual(['KV-BO-RC-01-PIU-RP', 'KV-BO-RC-02-PIU-SC']);
    expect(reporte.filas['codigos-provisionales'][0]).toMatchObject({ codigo: 'PIU-SC', asignaciones: 7 });
    expect(reporte.filas['dedicacion-inconsistente']).toEqual([
      expect.objectContaining({ cedula: 'V-1', valores: 'Exclusiva, Tiempo completo', aplicada: 'Exclusiva', actual: 'Exclusiva' }),
      expect.objectContaining({ cedula: 'V-99', aplicada: 'Medio tiempo', actual: 'Sin carga en el período' }),
    ]);
  });

  it('resume totales por tipo y conserva el origen de la última importación', () => {
    expect(reporte.totales).toEqual({
      sobrecargas: 2,
      deficit: 2,
      'sin-dedicacion': 1,
      vacantes: 2,
      'codigos-provisionales': 1,
      'dedicacion-inconsistente': 2,
    });
    expect(reporte.ultimaImportacion).toMatchObject({ nombreArchivo: 'CONSOLIDADO_OFERTA_2026_2.xlsx', usuarioNombre: 'Coordinación Académica' });
  });

  it('sin importaciones registradas no hay dedicación contradictoria', () => {
    const sinImportar = analizarInconsistenciasOferta({ docentes: [], vacantes: [], unidadesProvisionales: [], ultimaImportacion: null });
    expect(sinImportar.totales['dedicacion-inconsistente']).toBe(0);
    expect(sinImportar.ultimaImportacion).toBeNull();
  });

  it('valida el tipo recibido por query string', () => {
    expect(esTipoInconsistencia('vacantes')).toBe(true);
    expect(esTipoInconsistencia('cualquier-cosa')).toBe(false);
    expect(esTipoInconsistencia(undefined)).toBe(false);
  });
});

describe('Inconsistencias de la oferta: búsqueda, orden y paginación en servidor', () => {
  const reporte = reporteBase();

  it('busca sin distinguir acentos ni mayúsculas en las columnas visibles', () => {
    const r = paginarInconsistencias(reporte.filas.deficit, 'deficit', { q: 'perez' });
    expect(r.filas.map((f) => f.cedula)).toEqual(['V-1']);
    expect(r.pagination.total).toBe(1);
  });

  it('ordena por columnas numéricas y de texto, e ignora columnas inexistentes', () => {
    const asc = paginarInconsistencias(reporte.filas.sobrecargas, 'sobrecargas', { sortBy: 'horas', sortDir: 'asc' });
    expect(asc.filas.map((f) => f.horas)).toEqual([36, 48]);
    expect(asc.sortBy).toBe('horas');
    const texto = paginarInconsistencias(reporte.filas.vacantes, 'vacantes', { sortBy: 'sedeNombre', sortDir: 'asc' });
    expect(texto.filas[0].sedeNombre).toBe('Aldea CVG-GOSH');
    const invalida = paginarInconsistencias(reporte.filas.sobrecargas, 'sobrecargas', { sortBy: 'passwordHash' });
    expect(invalida.sortBy).toBeNull();
    expect(invalida.filas.map((f) => f.exceso)).toEqual([36, 20]);
  });

  it('pagina y acota la página solicitada al rango disponible', () => {
    const filas = Array.from({ length: 23 }, (_, i) => ({ id: `s${i}`, codigoSeccion: `SEC-${String(i).padStart(2, '0')}` }));
    const p3 = paginarInconsistencias(filas, 'vacantes', { page: 3, limit: 10 });
    expect(p3.filas).toHaveLength(3);
    expect(p3.pagination).toMatchObject({ page: 3, totalPages: 3, start: 21, end: 23, hasNextPage: false, hasPrevPage: true });
    expect(paginarInconsistencias(filas, 'vacantes', { page: 99, limit: 10 }).pagination.page).toBe(3);
    expect(paginarInconsistencias(filas, 'vacantes', { limit: 5000 }).pagination.limit).toBe(100);
    expect(paginarInconsistencias([], 'vacantes', {}).pagination).toMatchObject({ total: 0, start: 0, end: 0, totalPages: 1 });
  });
});

describe('Inconsistencias de la oferta: libro Excel', () => {
  it('genera una hoja de resumen y una hoja por tipo con encabezados, datos y autofiltro', async () => {
    const reporte = reporteBase();
    const buffer = await generarLibroInconsistencias(reporte, {
      periodoCodigo: '2026-II',
      generadoPor: 'Dirección Académica',
      fecha: new Date('2026-10-15T15:00:00Z'),
    });

    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(buffer as unknown as ArrayBuffer);
    expect(libro.worksheets.map((h) => h.name)).toEqual([
      'RESUMEN',
      'SOBRECARGA (H-04)',
      'DÉFICIT (H-05)',
      'SIN DEDICACIÓN',
      'SIN DOCENTE',
      'CÓDIGOS PROVISIONALES',
      'DEDICACIÓN CONTRADICTORIA',
    ]);

    const resumen = libro.getWorksheet('RESUMEN')!;
    expect(resumen.getCell('A1').value).toBe('INCONSISTENCIAS DE LA OFERTA DE CARGA HORARIA 2026-II');
    expect(resumen.getCell('A3').value).toContain('CONSOLIDADO_OFERTA_2026_2.xlsx');
    expect(resumen.getRow(6).getCell(2).value).toBe(2);

    const sobrecargas = libro.getWorksheet('SOBRECARGA (H-04)')!;
    expect(sobrecargas.getRow(1).values).toEqual([
      undefined,
      ...COLUMNAS_INCONSISTENCIA.sobrecargas.map((c) => c.titulo.toUpperCase()),
    ]);
    expect(sobrecargas.getRow(2).getCell(1).value).toBe('V-13017296');
    expect(sobrecargas.getRow(2).getCell(6).value).toBe(36);
    expect(sobrecargas.autoFilter).toBe('A1:G3');

    const vacantes = libro.getWorksheet('SIN DOCENTE')!;
    expect(vacantes.rowCount).toBe(3);
    expect(vacantes.getRow(2).getCell(2).value).toBe('KV-BO-RC-01');
  });
});
