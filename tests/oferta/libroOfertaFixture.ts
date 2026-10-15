import ExcelJS from 'exceljs';
import {
  COLUMNAS_OFERTA,
  ENCABEZADOS_OFERTA,
  FilaOfertaCruda,
} from '../../src/core/domain/rules/ofertaNormalizacion';

/** Construye un .xlsx con la misma disposición del consolidado institucional 2026-II. */
export async function libroComoOferta(
  filas: FilaOfertaCruda[],
  personalizar?: (hoja: ExcelJS.Worksheet) => void
): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet('OFERTA 2026-II TODA');
  hoja.getCell('M4').value = 'FECHA DE ENTREGA:  17/04/26';
  hoja.getCell('M5').value = ' ELABORADO POR : DRA. YORLIS MORA DE MONTERO';
  hoja.getCell('M6').value = 'REVISADO: 2';
  hoja.getCell('M7').value = 'FECHA  ACTUALIZACIÓN: 30-05-2026';
  hoja.mergeCells('F8:M8');
  hoja.getCell('F8').value = 'ACTUALIZACIÓN  DE OFERTA CARGA HORARIA 2026-II';
  COLUMNAS_OFERTA.forEach((col, i) => {
    hoja.getRow(10).getCell(i + 1).value = ENCABEZADOS_OFERTA[col];
  });
  filas.forEach((fila, idx) => {
    COLUMNAS_OFERTA.forEach((col, i) => {
      const v = fila[col];
      if (v !== undefined && v !== null) hoja.getRow(11 + idx).getCell(i + 1).value = v;
    });
  });
  personalizar?.(hoja);
  return Buffer.from((await libro.xlsx.writeBuffer()) as ArrayBuffer);
}

// Filas tomadas del consolidado real, con sus inconsistencias de captura.
export const FILAS_REALES: FilaOfertaCruda[] = [
  { A: 'IGS', B: 'I', C: '1', D: 'ALGORITMOS Y PROGRAMACIÓN', E: 4, F: 'KV BO-RC 01 A-M', G: 'IGS-AP-101', H: '14.123.456', I: 'MARIA JOSE PEREZ ROJAS', J: 'EXCLUSIVA', K: 'ASISTENTE', L: 2008, N: 'ORDINARIO', Q: 32, R: 'DIURNA', S: 'MAÑANA', T: 'CONTINUA', Z: 'CECSOTIL', AA: 'RIO Caura', AB: 'SEDE' },
  { A: 'IGS', B: 'I', C: '1', D: 'INTERNET Y LA WEB', E: 4, F: 'KVBO-RC 01A-M', G: 'IGS-IW-102', H: 14123456, I: 'MARIA JOSE PEREZ ROJAS', J: 'EXCLUSIVA', N: 'ORDINARIO', Q: 32, S: 'MAÑANA', AB: 'SEDE' },
  { A: 'IGS', B: 'I', C: '1', D: 'BASES DEL CONOCIMIENTO', E: 6, F: 'KV BO-RC 01 A-M', G: 'IGS-BC-103', H: 'V-14123456', I: 'MARIA JOSE PEREZ ROJAS', J: 'TIEMPO COMPLETO', N: 'ORDINARIO', Q: 32, S: 'MAÑANA', AB: 'SEDE' },
  { A: 'IGS', B: 'I', C: '1', D: 'INTRODUCCIÓN A LA INFORMÁTICA', E: 4, F: 'KV BO-RC 01 A-M', G: 'IGS-II-104', I: 'MARIA JOSE PEREZ ROJAS', Q: 32, S: 'MAÑANA', AB: 'SEDE' },
  { A: 'PIU', B: 'INTRODUCTORIO', C: '0', D: 'SEMINARIO DE CONTEXTO', E: 4, F: 'KV BO-CN 02 B-T', G: 'MAÑANA', H: '9.876.543', I: 'JOSE LUIS BONALDE', J: 'MEDIO TIEMPO', K: 'AUX DOCENTE', N: 'contrttada', Q: 40, S: 'TARDE', AA: 'CEPEC', AB: 'CVG GOSH', AC: 'MARTES 1:30 - 3:30' },
  { A: 'PIU', B: 'INTRODUCTORIO', C: '0', D: 'RECREANDO LA PATRIA', E: 2, F: 'KV BO-CN 02 B-T', I: 'POR ASIGNAR', Q: 40, S: 'TARDE', AA: 'EMRC', AB: 'CVG-Gosh' },
  { A: 'PIU', B: 'INTRODUCTORIO', C: '0', D: 'SEMINARIO DE CONTEXTO', E: 4, F: 'KV BO-CN 02 B-T', H: '7.111.222', I: 'ANA TERESA VERDE', J: 'CONVENCIONAL', Q: 40, S: 'TARDE', AB: 'CVG GOSH' },
  { A: 'PIU', B: 'INTRODUCTORIO', C: '0', D: 'PROYECTO SOMOS UBV', E: 2, F: 'KV BO-CN 02 B-T', I: 'POR ASIGNAR', Q: 40, S: 'TARDE', AB: 'CVG GOSH' },
  { A: null, D: 'IDIOMA   INGLES I', E: 2, F: 'ING-01', I: 'POR ASIGNAR', S: 'SABADO' },
  { A: 'EJ', B: 'III', C: '1', D: 'DERECHO CONSTITUCIONAL', E: 4, F: '', G: 'EJ-DC-301', I: 'POR ASIGNAR' },
];
