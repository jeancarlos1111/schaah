import ExcelJS from 'exceljs';
import { DedicacionDocente } from '../../core/domain/enums';
import { SeccionCargaInput, calcularCargaDocente } from '../../core/domain/rules/dedicacionRules';
import { DedicacionInconsistente } from './ofertaPlanificador';

export const TIPOS_INCONSISTENCIA = [
  'sobrecargas',
  'deficit',
  'sin-dedicacion',
  'vacantes',
  'codigos-provisionales',
  'dedicacion-inconsistente',
] as const;
export type TipoInconsistencia = (typeof TIPOS_INCONSISTENCIA)[number];

export const ETIQUETA_DEDICACION_CORTA: Record<string, string> = {
  [DedicacionDocente.DEDICACION_EXCLUSIVA]: 'Exclusiva',
  [DedicacionDocente.TIEMPO_COMPLETO]: 'Tiempo completo',
  [DedicacionDocente.MEDIO_TIEMPO]: 'Medio tiempo',
  [DedicacionDocente.TIEMPO_CONVENCIONAL]: 'Convencional',
};

export function etiquetaDedicacion(valor: string | null | undefined): string {
  return valor ? ETIQUETA_DEDICACION_CORTA[valor] ?? valor : 'Sin dedicación';
}

export interface InfoTipoInconsistencia {
  titulo: string;
  descripcion: string;
  icono: string;
  severidad: 'danger' | 'warning' | 'muted';
}

export const INFO_INCONSISTENCIA: Record<TipoInconsistencia, InfoTipoInconsistencia> = {
  sobrecargas: {
    titulo: 'Sobrecarga (H-04)',
    descripcion: 'Docentes cuyas horas asignadas en el período superan el tope de su dedicación.',
    icono: 'warning',
    severidad: 'danger',
  },
  deficit: {
    titulo: 'Déficit (H-05)',
    descripcion: 'Docentes con dedicación registrada que no alcanzan el mínimo de horas de docencia directa.',
    icono: 'arrow-down',
    severidad: 'warning',
  },
  'sin-dedicacion': {
    titulo: 'Sin dedicación',
    descripcion: 'Docentes con carga asignada pero sin dedicación registrada en el período: no se puede verificar H-04.',
    icono: 'question',
    severidad: 'warning',
  },
  vacantes: {
    titulo: 'Sin docente',
    descripcion: 'Asignaciones de unidad curricular que siguen como POR ASIGNAR.',
    icono: 'user',
    severidad: 'warning',
  },
  'codigos-provisionales': {
    titulo: 'Códigos provisionales',
    descripcion: 'Unidades curriculares a las que SAHAD generó un código porque la oferta no traía el oficial.',
    icono: 'hashtag',
    severidad: 'muted',
  },
  'dedicacion-inconsistente': {
    titulo: 'Dedicación contradictoria',
    descripcion: 'Docentes que en el archivo importado aparecen con más de una dedicación; se aplicó la más frecuente.',
    icono: 'shrink',
    severidad: 'muted',
  },
};

export interface DocenteInconsistenciaInput {
  id: string;
  cedula: string;
  nombres: string;
  apellidos: string;
  dedicacion: string | null;
  asignaciones: (SeccionCargaInput & { codigoSeccion: string })[];
}

export interface VacanteInput {
  id: string;
  codigoSeccion: string;
  grupoId: string | null;
  grupoCodigo: string | null;
  pfgCodigo: string;
  ucCodigo: string;
  ucNombre: string;
  horas: number;
  sedeNombre: string;
}

export interface UnidadProvisionalInput {
  id: string;
  pfgCodigo: string;
  codigo: string;
  nombre: string;
  asignaciones: number;
}

export interface ImportacionRegistrada {
  fecha: Date;
  nombreArchivo: string;
  usuarioNombre: string;
  dedicacionesInconsistentes: DedicacionInconsistente[];
}

export type ValorCelda = string | number | null;
export type FilaInconsistencia = Record<string, ValorCelda> & { id: string };

export interface ReporteInconsistencias {
  filas: Record<TipoInconsistencia, FilaInconsistencia[]>;
  totales: Record<TipoInconsistencia, number>;
  ultimaImportacion: Omit<ImportacionRegistrada, 'dedicacionesInconsistentes'> | null;
}

export interface ColumnaInconsistencia {
  clave: string;
  titulo: string;
  numerica?: boolean;
  ancho?: number;
}

const COL_CEDULA: ColumnaInconsistencia = { clave: 'cedula', titulo: 'Cédula', ancho: 14 };
const COL_DOCENTE: ColumnaInconsistencia = { clave: 'nombre', titulo: 'Docente', ancho: 36 };
const COL_DEDICACION: ColumnaInconsistencia = { clave: 'dedicacion', titulo: 'Dedicación', ancho: 16 };
const COL_HORAS: ColumnaInconsistencia = { clave: 'horas', titulo: 'Horas asignadas', numerica: true, ancho: 15 };
const COL_ASIGNACIONES: ColumnaInconsistencia = { clave: 'asignaciones', titulo: 'Asignaciones', numerica: true, ancho: 13 };

export const COLUMNAS_INCONSISTENCIA: Record<TipoInconsistencia, ColumnaInconsistencia[]> = {
  sobrecargas: [
    COL_CEDULA,
    COL_DOCENTE,
    COL_DEDICACION,
    COL_HORAS,
    { clave: 'maxHoras', titulo: 'Tope', numerica: true, ancho: 8 },
    { clave: 'exceso', titulo: 'Exceso', numerica: true, ancho: 9 },
    COL_ASIGNACIONES,
  ],
  deficit: [
    COL_CEDULA,
    COL_DOCENTE,
    COL_DEDICACION,
    COL_HORAS,
    { clave: 'minHoras', titulo: 'Mínimo', numerica: true, ancho: 9 },
    { clave: 'faltante', titulo: 'Faltan', numerica: true, ancho: 9 },
    COL_ASIGNACIONES,
  ],
  'sin-dedicacion': [COL_CEDULA, COL_DOCENTE, COL_HORAS, COL_ASIGNACIONES],
  vacantes: [
    { clave: 'codigoSeccion', titulo: 'Asignación', ancho: 30 },
    { clave: 'grupoCodigo', titulo: 'Sección (cohorte)', ancho: 20 },
    { clave: 'pfgCodigo', titulo: 'Programa', ancho: 12 },
    { clave: 'ucCodigo', titulo: 'Código UC', ancho: 16 },
    { clave: 'ucNombre', titulo: 'Unidad curricular', ancho: 40 },
    { clave: 'horas', titulo: 'Horas', numerica: true, ancho: 8 },
    { clave: 'sedeNombre', titulo: 'Sede', ancho: 34 },
  ],
  'codigos-provisionales': [
    { clave: 'pfgCodigo', titulo: 'Programa', ancho: 12 },
    { clave: 'codigo', titulo: 'Código provisional', ancho: 22 },
    { clave: 'nombre', titulo: 'Unidad curricular', ancho: 46 },
    COL_ASIGNACIONES,
  ],
  'dedicacion-inconsistente': [
    COL_CEDULA,
    COL_DOCENTE,
    { clave: 'valores', titulo: 'Valores en el archivo', ancho: 34 },
    { clave: 'aplicada', titulo: 'Dedicación aplicada', ancho: 18 },
    { clave: 'actual', titulo: 'Dedicación actual', ancho: 18 },
  ],
};

export function esTipoInconsistencia(valor: unknown): valor is TipoInconsistencia {
  return typeof valor === 'string' && (TIPOS_INCONSISTENCIA as readonly string[]).includes(valor);
}

function porNumeroDesc(clave: string) {
  return (a: FilaInconsistencia, b: FilaInconsistencia) =>
    Number(b[clave] ?? 0) - Number(a[clave] ?? 0) || String(a.nombre).localeCompare(String(b.nombre), 'es');
}

/**
 * Reúne lo que la coordinación debe corregir en la oferta del período: reglas H-04/H-05 sobre la carga
 * actual, vacantes, códigos provisionales y lo que solo se conoce al leer el archivo (dedicación contradictoria).
 */
export function analizarInconsistenciasOferta(input: {
  docentes: DocenteInconsistenciaInput[];
  vacantes: VacanteInput[];
  unidadesProvisionales: UnidadProvisionalInput[];
  ultimaImportacion: ImportacionRegistrada | null;
}): ReporteInconsistencias {
  const sobrecargas: FilaInconsistencia[] = [];
  const deficit: FilaInconsistencia[] = [];
  const sinDedicacion: FilaInconsistencia[] = [];
  const dedicacionActual = new Map<string, string | null>();

  for (const d of input.docentes) {
    dedicacionActual.set(d.cedula, d.dedicacion);
    const carga = calcularCargaDocente(d.dedicacion, d.asignaciones);
    const base = {
      id: d.id,
      cedula: d.cedula,
      nombre: `${d.apellidos}, ${d.nombres}`.trim(),
      dedicacion: etiquetaDedicacion(d.dedicacion),
      horas: carga.horas,
      asignaciones: carga.asignaciones,
    };
    if (carga.estado === 'SOBRECARGA') {
      sobrecargas.push({ ...base, maxHoras: carga.maxHoras, exceso: carga.horas - carga.maxHoras });
    } else if (carga.estado === 'DEFICIT' || carga.estado === 'SIN_ASIGNAR') {
      deficit.push({ ...base, minHoras: carga.minHoras, faltante: carga.minHoras - carga.horas });
    } else if (carga.estado === 'SIN_DEDICACION' && carga.horas > 0) {
      sinDedicacion.push(base);
    }
  }

  const vacantes: FilaInconsistencia[] = input.vacantes
    .map((v) => ({ ...v }))
    .sort((a, b) => a.codigoSeccion.localeCompare(b.codigoSeccion));

  const codigos: FilaInconsistencia[] = input.unidadesProvisionales
    .map((u) => ({ ...u }))
    .sort((a, b) => a.pfgCodigo.localeCompare(b.pfgCodigo) || a.nombre.localeCompare(b.nombre, 'es'));

  const contradictorias: FilaInconsistencia[] = (input.ultimaImportacion?.dedicacionesInconsistentes ?? [])
    .map((d) => ({
      id: d.cedula,
      cedula: d.cedula,
      nombre: d.nombre,
      valores: d.valores.map(etiquetaDedicacion).join(', '),
      aplicada: etiquetaDedicacion(d.aplicada),
      actual: dedicacionActual.has(d.cedula) ? etiquetaDedicacion(dedicacionActual.get(d.cedula)) : 'Sin carga en el período',
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  const filas: Record<TipoInconsistencia, FilaInconsistencia[]> = {
    sobrecargas: sobrecargas.sort(porNumeroDesc('exceso')),
    deficit: deficit.sort(porNumeroDesc('faltante')),
    'sin-dedicacion': sinDedicacion.sort(porNumeroDesc('horas')),
    vacantes,
    'codigos-provisionales': codigos,
    'dedicacion-inconsistente': contradictorias,
  };

  const totales = Object.fromEntries(TIPOS_INCONSISTENCIA.map((t) => [t, filas[t].length])) as Record<TipoInconsistencia, number>;
  const ultima = input.ultimaImportacion;
  return {
    filas,
    totales,
    ultimaImportacion: ultima ? { fecha: ultima.fecha, nombreArchivo: ultima.nombreArchivo, usuarioNombre: ultima.usuarioNombre } : null,
  };
}

const normalizarBusqueda = (t: unknown) =>
  String(t ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

/** Búsqueda, orden y paginación en servidor (Spec 07) sobre las filas de un tipo de inconsistencia. */
export function paginarInconsistencias(
  filas: FilaInconsistencia[],
  tipo: TipoInconsistencia,
  opciones: { q?: string; sortBy?: string; sortDir?: 'asc' | 'desc'; page?: number; limit?: number }
) {
  const columnas = COLUMNAS_INCONSISTENCIA[tipo];
  const termino = normalizarBusqueda(opciones.q?.trim());
  let resultado = termino
    ? filas.filter((f) => columnas.some((c) => normalizarBusqueda(f[c.clave]).includes(termino)))
    : [...filas];

  const columnaOrden = columnas.find((c) => c.clave === opciones.sortBy);
  if (columnaOrden) {
    const signo = opciones.sortDir === 'desc' ? -1 : 1;
    resultado.sort((a, b) => {
      const va = a[columnaOrden.clave];
      const vb = b[columnaOrden.clave];
      const cmp = columnaOrden.numerica
        ? Number(va ?? 0) - Number(vb ?? 0)
        : String(va ?? '').localeCompare(String(vb ?? ''), 'es');
      return cmp * signo;
    });
  }

  const limit = Math.min(100, Math.max(1, opciones.limit ?? 10));
  const total = resultado.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const page = Math.min(Math.max(1, opciones.page ?? 1), totalPages);
  const inicio = (page - 1) * limit;
  resultado = resultado.slice(inicio, inicio + limit);

  return {
    filas: resultado,
    sortBy: columnaOrden?.clave ?? null,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      start: total === 0 ? 0 : inicio + 1,
      end: Math.min(inicio + limit, total),
      hasPrevPage: page > 1,
      hasNextPage: page < totalPages,
    },
  };
}

const COLOR_ENCABEZADO = 'FF7A1F2B';

/** Libro .xlsx con una hoja de resumen y una hoja por tipo de inconsistencia, para enviar a la coordinación. */
export async function generarLibroInconsistencias(
  reporte: ReporteInconsistencias,
  meta: { periodoCodigo: string; generadoPor: string; fecha: Date }
): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  libro.creator = 'SAHAD UBV';
  libro.created = meta.fecha;

  const resumen = libro.addWorksheet('RESUMEN');
  resumen.getCell('A1').value = `INCONSISTENCIAS DE LA OFERTA DE CARGA HORARIA ${meta.periodoCodigo}`;
  resumen.getCell('A1').font = { bold: true, size: 14 };
  resumen.getCell('A2').value = `Generado por ${meta.generadoPor} el ${meta.fecha.toLocaleDateString('es-VE')}`;
  if (reporte.ultimaImportacion) {
    resumen.getCell('A3').value =
      `Última importación: ${reporte.ultimaImportacion.nombreArchivo} ` +
      `(${reporte.ultimaImportacion.fecha.toLocaleDateString('es-VE')}, ${reporte.ultimaImportacion.usuarioNombre})`;
  }
  const encabezadoResumen = resumen.getRow(5);
  ['Tipo', 'Cantidad', 'Descripción'].forEach((t, i) => {
    const celda = encabezadoResumen.getCell(i + 1);
    celda.value = t;
    celda.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_ENCABEZADO } };
  });
  TIPOS_INCONSISTENCIA.forEach((tipo, i) => {
    const fila = resumen.getRow(6 + i);
    fila.getCell(1).value = INFO_INCONSISTENCIA[tipo].titulo;
    fila.getCell(2).value = reporte.totales[tipo];
    fila.getCell(3).value = INFO_INCONSISTENCIA[tipo].descripcion;
  });
  resumen.getColumn(1).width = 28;
  resumen.getColumn(2).width = 11;
  resumen.getColumn(3).width = 100;

  for (const tipo of TIPOS_INCONSISTENCIA) {
    const columnas = COLUMNAS_INCONSISTENCIA[tipo];
    const hoja = libro.addWorksheet(INFO_INCONSISTENCIA[tipo].titulo.toUpperCase().slice(0, 31), {
      views: [{ state: 'frozen', ySplit: 1 }],
    });
    const encabezado = hoja.getRow(1);
    columnas.forEach((c, i) => {
      const celda = encabezado.getCell(i + 1);
      celda.value = c.titulo.toUpperCase();
      celda.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
      celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_ENCABEZADO } };
      celda.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      hoja.getColumn(i + 1).width = c.ancho ?? 14;
    });
    encabezado.height = 30;
    reporte.filas[tipo].forEach((f, idx) => {
      const row = hoja.getRow(2 + idx);
      columnas.forEach((c, i) => {
        const v = f[c.clave];
        if (v !== null && v !== undefined && v !== '') row.getCell(i + 1).value = v;
      });
    });
    const ultimaColumna = hoja.getColumn(columnas.length).letter;
    hoja.autoFilter = `A1:${ultimaColumna}${1 + Math.max(reporte.filas[tipo].length, 1)}`;
  }

  const salida = await libro.xlsx.writeBuffer();
  return Buffer.from(salida as ArrayBuffer);
}
