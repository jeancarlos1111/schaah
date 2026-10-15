import ExcelJS from 'exceljs';
import {
  COLUMNAS_OFERTA,
  ENCABEZADOS_OFERTA,
  FilaOfertaCruda,
  ValorCelda,
  claveComparacion,
  textoCelda,
} from '../../core/domain/rules/ofertaNormalizacion';

export interface MetadatosOferta {
  titulo: string;
  lineas: string[];
}

export interface FilaLeida {
  numero: number;
  celdas: FilaOfertaCruda;
}

export interface LibroOfertaLeido {
  hoja: string;
  filaEncabezado: number;
  meta: MetadatosOferta;
  filas: FilaLeida[];
}

export const FILA_ENCABEZADO_OFERTA = 10;
const MAX_FILAS_BUSQUEDA_ENCABEZADO = 30;

export class FormatoOfertaInvalidoError extends Error {}

function valorCelda(valor: ExcelJS.CellValue): ValorCelda {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === 'string' || typeof valor === 'number') return valor;
  if (typeof valor === 'boolean') return valor ? 'SI' : 'NO';
  if (valor instanceof Date) return valor;
  if (typeof valor === 'object') {
    if ('richText' in valor) return valor.richText.map((t) => t.text).join('');
    if ('formula' in valor || 'sharedFormula' in valor) {
      return valorCelda((valor as ExcelJS.CellFormulaValue).result as ExcelJS.CellValue);
    }
    if ('text' in valor) return String((valor as ExcelJS.CellHyperlinkValue).text);
    if ('error' in valor) return null;
  }
  return String(valor);
}

function esFilaEncabezado(fila: ExcelJS.Row): boolean {
  const a = claveComparacion(valorCelda(fila.getCell(1).value));
  const d = claveComparacion(valorCelda(fila.getCell(4).value));
  const f = claveComparacion(valorCelda(fila.getCell(6).value));
  return a === 'PFG' && d.includes('UNIDAD') && f.startsWith('SECCION');
}

function seleccionarHoja(libro: ExcelJS.Workbook): { hoja: ExcelJS.Worksheet; filaEncabezado: number } {
  for (const hoja of libro.worksheets) {
    const limite = Math.min(hoja.rowCount, MAX_FILAS_BUSQUEDA_ENCABEZADO);
    for (let n = 1; n <= limite; n++) {
      if (esFilaEncabezado(hoja.getRow(n))) return { hoja, filaEncabezado: n };
    }
  }
  throw new FormatoOfertaInvalidoError(
    'El archivo no tiene el formato de la oferta de carga horaria: no se encontró la fila de encabezados (PFG, UNIDAD CURRICULAR, SECCIÓN).'
  );
}

function extraerMetadatos(hoja: ExcelJS.Worksheet, filaEncabezado: number): MetadatosOferta {
  const lineas: string[] = [];
  let titulo = '';
  for (let n = 1; n < filaEncabezado; n++) {
    const textos = new Set<string>();
    hoja.getRow(n).eachCell((celda) => {
      const t = textoCelda(valorCelda(celda.value));
      if (t) textos.add(t);
    });
    for (const t of textos) {
      if (claveComparacion(t).includes('OFERTA')) titulo = t;
      else lineas.push(t);
    }
  }
  return { titulo, lineas };
}

/** Lee la hoja de oferta (29 columnas A..AC) desde un buffer .xlsx. */
export async function leerLibroOferta(buffer: Buffer | ArrayBuffer): Promise<LibroOfertaLeido> {
  const libro = new ExcelJS.Workbook();
  try {
    await libro.xlsx.load(buffer as ArrayBuffer);
  } catch {
    throw new FormatoOfertaInvalidoError('No se pudo leer el archivo: debe ser un libro de Excel (.xlsx) válido.');
  }

  const { hoja, filaEncabezado } = seleccionarHoja(libro);
  const filas: FilaLeida[] = [];

  hoja.eachRow({ includeEmpty: false }, (fila, numero) => {
    if (numero <= filaEncabezado) return;
    const celdas: FilaOfertaCruda = {};
    let conDatos = false;
    COLUMNAS_OFERTA.forEach((col, i) => {
      const v = valorCelda(fila.getCell(i + 1).value);
      if (v !== null && textoCelda(v) !== '') {
        celdas[col] = v;
        conDatos = true;
      }
    });
    if (conDatos) filas.push({ numero, celdas });
  });

  return { hoja: hoja.name, filaEncabezado, meta: extraerMetadatos(hoja, filaEncabezado), filas };
}

const ANCHOS_COLUMNA: Partial<Record<(typeof COLUMNAS_OFERTA)[number], number>> = {
  A: 12, D: 46, F: 20, G: 18, H: 13, I: 34, J: 18, K: 18, N: 16, O: 30, P: 30, Q: 14,
  S: 12, T: 13, V: 20, X: 20, Y: 18, Z: 14, AA: 18, AB: 20, AC: 40,
};

/** Genera el libro .xlsx con el formato institucional de la oferta (encabezado en la fila 10). */
export async function generarLibroOferta(
  meta: MetadatosOferta,
  filas: FilaOfertaCruda[],
  nombreHoja = 'OFERTA'
): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  libro.creator = 'SAHAD UBV';
  libro.created = new Date();
  const hoja = libro.addWorksheet(nombreHoja.slice(0, 31), {
    views: [{ state: 'frozen', ySplit: FILA_ENCABEZADO_OFERTA }],
  });

  meta.lineas.slice(0, 4).forEach((linea, i) => {
    const celda = hoja.getCell(`M${4 + i}`);
    celda.value = linea;
    celda.font = { bold: true, size: 10 };
  });
  if (meta.titulo) {
    hoja.mergeCells('F8:M8');
    const celda = hoja.getCell('F8');
    celda.value = meta.titulo;
    celda.font = { bold: true, size: 14 };
    celda.alignment = { horizontal: 'center', vertical: 'middle' };
  }

  const encabezado = hoja.getRow(FILA_ENCABEZADO_OFERTA);
  COLUMNAS_OFERTA.forEach((col, i) => {
    const celda = encabezado.getCell(i + 1);
    celda.value = ENCABEZADOS_OFERTA[col];
    celda.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7A1F2B' } };
    celda.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    celda.border = {
      top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' },
    };
    hoja.getColumn(i + 1).width = ANCHOS_COLUMNA[col] ?? 11;
  });
  encabezado.height = 36;

  filas.forEach((fila, idx) => {
    const row = hoja.getRow(FILA_ENCABEZADO_OFERTA + 1 + idx);
    COLUMNAS_OFERTA.forEach((col, i) => {
      const v = fila[col];
      if (v !== null && v !== undefined && v !== '') row.getCell(i + 1).value = v;
    });
  });

  const ultima = FILA_ENCABEZADO_OFERTA + Math.max(filas.length, 1);
  hoja.autoFilter = `A${FILA_ENCABEZADO_OFERTA}:AC${ultima}`;

  const salida = await libro.xlsx.writeBuffer();
  return Buffer.from(salida as ArrayBuffer);
}
