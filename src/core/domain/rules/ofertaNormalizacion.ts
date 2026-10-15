import {
  CondicionLaboral,
  DedicacionDocente,
  EscalafonDocente,
  EstatusGrupo,
  MallaGrupo,
  TipoPrograma,
  Turno,
} from '../enums';
import { obtenerTrayectoPorTramo, validarCorrespondenciaTrayectoTramo } from './curriculoRules';

/**
 * Normalización del consolidado institucional "OFERTA DE CARGA HORARIA" (hoja de 29 columnas A..AC).
 * Funciones puras: convierten los valores capturados manualmente en la hoja (con errores de
 * tipeo, abreviaturas y columnas corridas) a los valores canónicos del dominio SAHAD.
 */

export type ValorCelda = string | number | Date | null | undefined;

export const COLUMNAS_OFERTA = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O',
  'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 'AA', 'AB', 'AC',
] as const;

export type ColumnaOferta = (typeof COLUMNAS_OFERTA)[number];

export const ENCABEZADOS_OFERTA: Record<ColumnaOferta, string> = {
  A: 'PFG',
  B: 'TRAYECTO',
  C: 'TRAMO',
  D: 'UNIDAD CURRICULAR',
  E: 'NRO. DE HORA X UC',
  F: 'SECCIÓN',
  G: 'CÓDIGO U.C. /ELECTIVA',
  H: 'CÉDULA',
  I: 'NOMBRE Y APELLIDOS',
  J: 'DEDICACIÓN',
  K: 'ESCALAFÓN',
  L: 'AÑO DE INGRESO',
  M: 'AÑO DE CONCURSO',
  N: 'DOCENTE/ CONDICIÓN',
  O: 'PROFESIÓN',
  P: 'ESTUDIOS DE 4TO NIVEL',
  Q: 'CANTIDAD DE ESTUDIANTES POR U.C.',
  R: 'MALLA',
  S: 'TURNO',
  T: 'ESTATUS',
  U: 'SECCIONES POR ASESORIA',
  V: 'AULA ESPECIALIZADA',
  W: 'NRO DE ENCUENTROS',
  X: 'EJE TERRITORIAL',
  Y: 'ÁREA ACADÉMICA',
  Z: 'CENTRO DE ESTUDIO',
  AA: 'EJE MUNICIPAL',
  AB: 'NOMBRE DE ALDEA',
  AC: 'OBSERVACIONES',
};

export type FilaOfertaCruda = Partial<Record<ColumnaOferta, ValorCelda>>;

// ---------------------------------------------------------------------------
// Utilidades de texto
// ---------------------------------------------------------------------------

export function textoCelda(valor: ValorCelda): string {
  if (valor === null || valor === undefined) return '';
  if (valor instanceof Date) return valor.toISOString();
  return String(valor).replace(/\s+/g, ' ').trim();
}

/** Clave de comparación: mayúsculas, sin acentos y con espacios colapsados. */
export function claveComparacion(valor: ValorCelda): string {
  return textoCelda(valor)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function capitalizarPalabra(palabra: string): string {
  if (!palabra) return palabra;
  const minus = palabra.toLocaleLowerCase('es');
  return minus.charAt(0).toLocaleUpperCase('es') + minus.slice(1);
}

export function aTitulo(valor: string): string {
  return valor
    .split(' ')
    .filter(Boolean)
    .map(capitalizarPalabra)
    .join(' ');
}

function textoOpcional(valor: ValorCelda): string | null {
  const t = textoCelda(valor);
  if (!t) return null;
  const clave = claveComparacion(t);
  if (['NO', 'X', 'N/A', 'NA', '-', '0'].includes(clave)) return null;
  return t;
}

// ---------------------------------------------------------------------------
// Catálogos docentes
// ---------------------------------------------------------------------------

export function normalizarDedicacion(valor: ValorCelda): DedicacionDocente | null {
  const c = claveComparacion(valor);
  if (!c) return null;
  if (/^EX\w*US/.test(c) || c.startsWith('EXCL') || c === 'DE') return DedicacionDocente.DEDICACION_EXCLUSIVA;
  if (c.includes('TIEMPO COMPLETO') || c === 'TC') return DedicacionDocente.TIEMPO_COMPLETO;
  if (c.includes('MEDIO TIEMPO') || c === 'MT') return DedicacionDocente.MEDIO_TIEMPO;
  if (c.includes('CONVENCIONAL') || c === 'TV') return DedicacionDocente.TIEMPO_CONVENCIONAL;
  return null;
}

export function normalizarEscalafon(valor: ValorCelda): EscalafonDocente | null {
  const c = claveComparacion(valor);
  if (!c) return null;
  if (c.startsWith('AUX')) return EscalafonDocente.AUXILIAR_DOCENTE;
  if (c.startsWith('INSTRUCTOR')) return EscalafonDocente.INSTRUCTOR;
  if (c.startsWith('ASISTENTE')) return EscalafonDocente.ASISTENTE;
  if (c.startsWith('AGREGAD')) return EscalafonDocente.AGREGADO;
  if (c.startsWith('ASOCIAD')) return EscalafonDocente.ASOCIADO;
  if (c.startsWith('TITULAR')) return EscalafonDocente.TITULAR;
  return null;
}

export function normalizarCondicion(valor: ValorCelda): CondicionLaboral | null {
  const c = claveComparacion(valor);
  if (!c) return null;
  if (c.startsWith('POR CONTRAT')) return CondicionLaboral.POR_CONTRATAR;
  if (c.startsWith('ORDINARI')) return CondicionLaboral.ORDINARIO;
  if (c.startsWith('JUBILAD')) return CondicionLaboral.JUBILADO_ACTIVO;
  if (c.includes('COMISION')) return CondicionLaboral.COMISION_SERVICIO;
  // Variantes de tipeo observadas: CONTRATADA, contrttada, contratrda, contatrado
  if (c.startsWith('CONT')) return CondicionLaboral.CONTRATADO;
  return null;
}

/** Cédula canónica "V-12345678" o null si no tiene al menos 5 dígitos. */
export function normalizarCedula(valor: ValorCelda): string | null {
  const t = textoCelda(valor).toUpperCase();
  const digitos = t.replace(/\D/g, '');
  if (digitos.length < 5 || digitos.length > 10) return null;
  const prefijo = t.trim().startsWith('E') ? 'E' : 'V';
  return `${prefijo}-${String(parseInt(digitos, 10))}`;
}

export function esDocentePorAsignar(nombre: ValorCelda): boolean {
  const c = claveComparacion(nombre);
  return !c || c.includes('POR ASIGNAR') || c.includes('POR CONTRATAR') || c === 'VACANTE';
}

/**
 * Divide "NOMBRE(S) APELLIDO(S)" en nombres/apellidos.
 * Las iniciales ("M.") se consideran parte de los nombres.
 */
export function dividirNombreCompleto(valor: ValorCelda): { nombres: string; apellidos: string } {
  const tokens = textoCelda(valor).split(' ').filter(Boolean);
  if (tokens.length === 0) return { nombres: '', apellidos: '' };
  if (tokens.length === 1) return { nombres: aTitulo(tokens[0]), apellidos: '' };

  const esInicial = (t: string) => /^[A-ZÁÉÍÓÚÑ]\.?$/i.test(t);
  let corte = Math.floor(tokens.length / 2);
  while (corte < tokens.length - 1 && esInicial(tokens[corte])) corte++;

  const nombres = tokens.slice(0, corte).map((t) => (esInicial(t) ? t.toUpperCase() : capitalizarPalabra(t)));
  const apellidos = tokens.slice(corte).map(capitalizarPalabra);
  return { nombres: nombres.join(' '), apellidos: apellidos.join(' ') };
}

// ---------------------------------------------------------------------------
// Números, años y trayectos
// ---------------------------------------------------------------------------

const ROMANOS: Record<string, number> = {
  I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10,
};

/** Convierte "VIII", "4", "INTRODUCTORIO" (=0) a entero; null si no es interpretable. */
export function romanoAEntero(valor: ValorCelda): number | null {
  if (typeof valor === 'number') return Number.isInteger(valor) && valor >= 0 ? valor : null;
  const c = claveComparacion(valor);
  if (!c) return null;
  if (c.startsWith('INTRO') || c.includes('INICIAL')) return 0;
  if (/^\d+$/.test(c)) return parseInt(c, 10);
  return ROMANOS[c] ?? null;
}

/**
 * Ajusta trayecto/tramo a la convención correlativa de RC-06 (Tramo = 2T-1 o 2T).
 * La hoja mezcla tramos correlativos ("4 / 8") con tramos relativos al trayecto ("3 / 1" => tramo 5).
 */
export function normalizarTrayectoTramo(
  trayecto: number | null,
  tramo: number | null
): { trayecto: number | null; tramo: number | null; ajustado: boolean } {
  if (trayecto === null && tramo === null) return { trayecto, tramo, ajustado: false };
  if (trayecto === null && tramo !== null) {
    return { trayecto: obtenerTrayectoPorTramo(tramo), tramo, ajustado: true };
  }
  if (trayecto !== null && tramo === null) return { trayecto, tramo, ajustado: false };

  if (validarCorrespondenciaTrayectoTramo(trayecto!, tramo!).valido) {
    return { trayecto, tramo, ajustado: false };
  }
  if (trayecto! >= 1 && (tramo === 1 || tramo === 2)) {
    return { trayecto, tramo: 2 * trayecto! - 2 + tramo!, ajustado: true };
  }
  return { trayecto, tramo: null, ajustado: true };
}

export function enteroPositivo(valor: ValorCelda): number | null {
  if (typeof valor === 'number') return Number.isFinite(valor) && valor > 0 ? Math.round(valor) : null;
  const c = claveComparacion(valor);
  if (!/^\d+$/.test(c)) return null;
  const n = parseInt(c, 10);
  return n > 0 ? n : null;
}

export function enteroNoNegativo(valor: ValorCelda): number | null {
  if (typeof valor === 'number') return Number.isFinite(valor) && valor >= 0 ? Math.round(valor) : null;
  const c = claveComparacion(valor);
  if (!/^\d+$/.test(c)) return null;
  return parseInt(c, 10);
}

const EPOCH_EXCEL_MS = Date.UTC(1899, 11, 30);
// Seriales anteriores a 1970 se descartan: suelen ser años mal tecleados ("20013").
const SERIAL_1970 = 25569;
const SERIAL_2100 = 73051;

/**
 * Año a partir de: "2004", 2004, fecha serial de Excel (45201 => 2023), Date,
 * o con errores de tipeo ("2O19", "201|9", "202O"). Null para "NO CONCURSO", "N/A", "X", etc.
 */
export function serialExcelAAnio(valor: ValorCelda): number | null {
  if (valor instanceof Date) {
    const anio = valor.getUTCFullYear();
    return anio >= 1950 && anio <= 2100 ? anio : null;
  }

  let numero: number | null = null;
  if (typeof valor === 'number') {
    numero = Math.trunc(valor);
  } else {
    const c = claveComparacion(valor).replace(/O/g, '0').replace(/[^0-9]/g, '');
    if (!c) return null;
    numero = parseInt(c, 10);
  }

  if (numero >= 1950 && numero <= 2100) return numero;
  if (numero >= SERIAL_1970 && numero <= SERIAL_2100) {
    return new Date(EPOCH_EXCEL_MS + numero * 86_400_000).getUTCFullYear();
  }
  return null;
}

// ---------------------------------------------------------------------------
// Programas, grupos y unidades curriculares
// ---------------------------------------------------------------------------

/** Código de programa canónico (las variantes de PNFEIC se agrupan en PNFEIC). */
export function normalizarCodigoPrograma(valor: ValorCelda): string | null {
  const c = claveComparacion(valor);
  if (!c) return null;
  if (c.startsWith('PNFEIC')) return 'PNFEIC';
  return c.replace(/\s+Y\s+/g, '-').replace(/[^A-Z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
}

export interface ProgramaOfertaCatalogo {
  nombre: string;
  areaConocimiento: string;
  /** Código del programa ya registrado en SAHAD que corresponde a este código de la oferta. */
  codigoSahad?: string;
}

export const PROGRAMAS_OFERTA: Record<string, ProgramaOfertaCatalogo> = {
  PIU: { nombre: 'Programa de Iniciación Universitaria', areaConocimiento: 'Formación General' },
  LP: { nombre: 'Liderazgo Productivo', areaConocimiento: 'Formación General' },
  EJ: { nombre: 'Estudios Jurídicos', areaConocimiento: 'Ciencias Sociales y Jurídicas', codigoSahad: 'PFG-EJ' },
  CS: { nombre: 'Comunicación Social', areaConocimiento: 'Ciencias Sociales y Humanidades' },
  AGR: { nombre: 'Agroecología', areaConocimiento: 'Ciencias del Agro y del Mar', codigoSahad: 'PFG-AGRO' },
  'PESC-ACU': { nombre: 'Pesca y Acuicultura', areaConocimiento: 'Ciencias del Agro y del Mar' },
  PNFEIC: { nombre: 'PNF en Enfermería Integral Comunitaria', areaConocimiento: 'Ciencias de la Salud' },
  IDIOMAS: { nombre: 'Programa de Idiomas', areaConocimiento: 'Lenguas y Comunicación' },
  IGMI: { nombre: 'Geología y Minería Integral', areaConocimiento: 'Tecnología y Ciencias Aplicadas' },
  PSI: { nombre: 'Psicología', areaConocimiento: 'Ciencias Sociales y Humanidades' },
  SACN: { nombre: 'Seguridad Alimentaria y Cultura Nutricional', areaConocimiento: 'Ciencias de la Salud' },
  EPYG: { nombre: 'Estudios Políticos y Gobierno', areaConocimiento: 'Ciencias Sociales y Jurídicas' },
  GSDL: { nombre: 'Gestión Social para el Desarrollo Local', areaConocimiento: 'Ciencias Sociales y Humanidades' },
  ARQ: { nombre: 'Arquitectura', areaConocimiento: 'Tecnología y Ciencias Aplicadas' },
  GSP: { nombre: 'Gestión en Salud Pública', areaConocimiento: 'Ciencias de la Salud' },
  GA: { nombre: 'Gestión Ambiental', areaConocimiento: 'Ciencias Ecológicas y Desarrollo Sustentable', codigoSahad: 'PFG-GA' },
  PFA: { nombre: 'Programas de Formación Avanzada', areaConocimiento: 'Postgrado' },
  IGS: { nombre: 'Informática para la Gestión Social', areaConocimiento: 'Tecnología y Ciencias Aplicadas', codigoSahad: 'PFG-INFO' },
};

/** Código con el que se registra en SAHAD un programa de la oferta. */
export function codigoProgramaSahad(codigoOferta: string): string {
  return PROGRAMAS_OFERTA[codigoOferta]?.codigoSahad ?? codigoOferta;
}

/** Código con el que se exporta a la hoja de oferta un programa de SAHAD. */
export function codigoProgramaOferta(codigoSahad: string): string {
  const entrada = Object.entries(PROGRAMAS_OFERTA).find(([, p]) => p.codigoSahad === codigoSahad);
  return entrada ? entrada[0] : codigoSahad;
}

/** Programa implícito de filas sin PFG cuyas unidades son cursos de idiomas. */
export function inferirProgramaPorUnidad(nombreUc: ValorCelda): string | null {
  const c = claveComparacion(nombreUc);
  return /^(IDIOMA|INGLES|PORTUGUES|FRANCES|ITALIANO|MANDARIN|RUSO|LENGUAJE DE SENAS)/.test(c) ? 'IDIOMAS' : null;
}

export function inferirTipoPrograma(codigoPrograma: string | null | undefined): TipoPrograma {
  const c = claveComparacion(codigoPrograma ?? '');
  if (c === 'PIU') return TipoPrograma.PIU;
  if (c === 'PFA') return TipoPrograma.PFA;
  if (c === 'IDIOMAS') return TipoPrograma.IDIOMAS;
  if (c.startsWith('PNF')) return TipoPrograma.PNF;
  return TipoPrograma.PFG;
}

export function normalizarTipoPrograma(valor: ValorCelda): TipoPrograma {
  const c = claveComparacion(valor);
  return (Object.values(TipoPrograma) as string[]).includes(c) ? (c as TipoPrograma) : TipoPrograma.PFG;
}

/**
 * Código de grupo/sección canónico. Unifica las múltiples formas de escribir la misma sección:
 * "KV BO-RC 01 A-M", "KVBO-RC 01A-M", "KV BO – RC 1AM" => "KV-BO-RC-01-A-M".
 * Los códigos con otra estructura (cohortes PFA, "SACN7-T1-HE") se limpian conservando su forma.
 */
export function normalizarCodigoGrupo(valor: ValorCelda): string {
  const c = claveComparacion(valor);
  if (!c) return '';

  const patronUbv = /^K[VR]\s*-?\s*BO\s*-?\s*([A-Z]{2,3})\s*-?\s*(\d{1,2})\s*-?\s*([A-Z])\s*-?\s*([MTN])$/;
  const m = c.match(patronUbv);
  if (m) {
    const [, zona, numero, letra, turno] = m;
    return `KV-BO-${zona}-${numero.padStart(2, '0')}-${letra}-${turno}`;
  }

  return c.replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** Turno implícito en el sufijo del código canónico (…-A-M / -T / -N). */
export function inferirTurnoDesdeCodigoGrupo(codigoNormalizado: string): Turno | null {
  const m = codigoNormalizado.match(/^KV-BO-[A-Z]{2,3}-\d{2}-[A-Z]-([MTN])$/);
  if (!m) return null;
  return m[1] === 'M' ? Turno.MATUTINO : m[1] === 'T' ? Turno.VESPERTINO : Turno.NOCTURNO;
}

export function normalizarTurno(valor: ValorCelda): Turno | null {
  const c = claveComparacion(valor);
  if (!c) return null;
  if (c.startsWith('MANANA') || c === 'MATUTINO' || c === 'M') return Turno.MATUTINO;
  if (c.startsWith('TARDE') || c === 'VESPERTINO' || c === 'T') return Turno.VESPERTINO;
  if (c.startsWith('NOCHE') || c.startsWith('NOCTURN') || c === 'N') return Turno.NOCTURNO;
  if (c.includes('SEMANA') || c.startsWith('SABADO')) return Turno.FIN_DE_SEMANA;
  if (c.startsWith('UNIC')) return Turno.UNICA;
  return null;
}

export function normalizarMalla(valor: ValorCelda): MallaGrupo | null {
  const c = claveComparacion(valor);
  if (!c) return null;
  if (c === 'D' || c.startsWith('DIURN')) return MallaGrupo.DIURNA;
  if (c.startsWith('NOCTURN')) return MallaGrupo.NOCTURNA;
  return null;
}

export function normalizarEstatus(valor: ValorCelda): EstatusGrupo | null {
  const c = claveComparacion(valor);
  if (!c) return null;
  if (c.startsWith('INICIA') || c.startsWith('APE') || c.startsWith('ABRE') || c.startsWith('APERTURA')) {
    return EstatusGrupo.APERTURA;
  }
  if (c.startsWith('CONTINU')) return EstatusGrupo.CONTINUA;
  if (c.startsWith('CIERR')) return EstatusGrupo.CIERRA;
  if (c.startsWith('FINALIZ')) return EstatusGrupo.FINALIZA;
  return null;
}

/** Código de UC válido; descarta valores corridos de otras columnas ("MAÑANA", "TARDE"). */
export function normalizarCodigoUC(valor: ValorCelda): string | null {
  const c = claveComparacion(valor);
  if (!c || normalizarTurno(c) !== null) return null;
  if (!/[0-9]/.test(c) && !c.includes('-')) return null;
  return c.replace(/\s+/g, '');
}

export function esCodigoElectiva(codigoUc: string | null, nombreUc: string): boolean {
  const codigo = claveComparacion(codigoUc ?? '');
  return codigo.startsWith('ELE') || claveComparacion(nombreUc).startsWith('ELECTIVA');
}

export function esUnidadProyecto(codigoUc: string | null, nombreUc: string): boolean {
  const codigo = claveComparacion(codigoUc ?? '');
  const nombre = claveComparacion(nombreUc);
  return codigo.startsWith('PRY-') || nombre.startsWith('PROYECTO');
}

const PALABRAS_VACIAS = new Set(['DE', 'LA', 'EL', 'LOS', 'LAS', 'DEL', 'Y', 'EN', 'A', 'AL', 'PARA', 'POR', 'CON']);

/** Código sintético para UCs que la oferta no codifica (PIU, LP, PFA, …). */
export function generarCodigoUC(codigoPrograma: string, nombreUc: string): string {
  const palabras = claveComparacion(nombreUc).replace(/[^A-Z0-9 ]/g, ' ').split(' ').filter(Boolean);
  const siglas = palabras
    .filter((p) => !PALABRAS_VACIAS.has(p))
    .map((p) => (ROMANOS[p] !== undefined || /^\d+$/.test(p) ? p : p.charAt(0)))
    .join('');
  return `${codigoPrograma}-${siglas || 'UC'}`.slice(0, 30);
}

// ---------------------------------------------------------------------------
// Territorio
// ---------------------------------------------------------------------------

export const CENTROS_ESTUDIO_UBV: Record<string, string> = {
  CEA: 'Centro de Estudios Ambientales',
  CESYC: 'Centro de Estudios Sociales y Culturales',
  CEPEC: 'Centro de Estudios para la Educación Emancipadora',
  CESACODEVI: 'Centro de Estudios en Salud Colectiva y Derecho a la Vida',
  CEEP: 'Centro de Estudios de Economía Política',
  CECSOTIL: 'Centro de Estudios en Ciencia, Sociedad y Tecnologías Libres',
  CEPCI: 'Centro de Estudios de Pueblos y Culturas Indígenas',
};

export function normalizarCentroEstudio(valor: ValorCelda): string | null {
  const c = claveComparacion(valor).replace(/\s+/g, '');
  if (!c) return null;
  if (c === 'CEPEEC') return 'CEPEC';
  if (c === 'CESOTIL') return 'CECSOTIL';
  return CENTROS_ESTUDIO_UBV[c] ? c : null;
}

export const EJES_MUNICIPALES = [
  'RÍO CAURA',
  'RÍO CARONÍ',
  'SIERRA IMATACA',
  'INDIO PEMÓN',
  'FAJA DEL ORINOCO',
] as const;

export function normalizarEjeMunicipal(valor: ValorCelda): string | null {
  const c = claveComparacion(valor);
  if (!c) return null;
  // En la hoja, "EMRC" solo aparece en filas de la aldea CVG-GOSH (Puerto Ordaz): Eje Municipal Río Caroní.
  if (c === 'EMRC' || c.includes('CARON')) return 'RÍO CARONÍ';
  if (c.includes('CAURA')) return 'RÍO CAURA';
  if (c.includes('IMATACA')) return 'SIERRA IMATACA';
  if (c.includes('PEMON')) return 'INDIO PEMÓN';
  if (c.includes('ORINOCO')) return 'FAJA DEL ORINOCO';
  return null;
}

export const SEDE_PRINCIPAL_CODIGO = 'SEDE_BOLIVAR_ANGOSTURA';
export const ALDEA_CVG_GOSH_CODIGO = 'ALDEA_CVG_GOSH';
export const ALDEA_GRAN_SABANA_CODIGO = 'ALDEA_GRAN_SABANA';

/** Código de sede SAHAD a partir del nombre de aldea de la oferta (vacío => sede principal). */
export function normalizarAldea(valor: ValorCelda): string {
  const c = claveComparacion(valor).replace(/[^A-Z ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (/[CG]VG ?GOSH/.test(c)) return ALDEA_CVG_GOSH_CODIGO;
  if (c.includes('GRAN SABANA')) return ALDEA_GRAN_SABANA_CODIGO;
  return SEDE_PRINCIPAL_CODIGO;
}

export function normalizarAulaEspecializada(valor: ValorCelda): string | null {
  const c = claveComparacion(valor);
  if (!c) return null;
  if (c.includes('COMPUTACION') || c.startsWith('LAB')) return 'TALLER COMPUTACION';
  if (c.includes('DIBUJO')) return 'TALLER DE DIBUJO';
  if (c.startsWith('TALLER')) return textoCelda(valor).toUpperCase();
  if (c.includes('MULTIMODAL')) return 'MULTIMODAL';
  return null;
}

// ---------------------------------------------------------------------------
// Observaciones con horario textual
// ---------------------------------------------------------------------------

export interface HorarioObservado {
  dia: string;
  horaInicio: string;
  horaFin: string;
}

function horaCivilA24(hora: number, minutos: number): string {
  // Convención de la hoja: 1:00-6:59 es de tarde, 7:00-11:59 de mañana, 12 es mediodía.
  const h24 = hora >= 1 && hora <= 6 ? hora + 12 : hora;
  return `${String(h24).padStart(2, '0')}:${String(minutos).padStart(2, '0')}`;
}

/** Extrae "MARTES 1:30 - 3:30" => { dia: 'MARTES', horaInicio: '13:30', horaFin: '15:30' }. */
export function extraerHorarioObservacion(valor: ValorCelda): HorarioObservado | null {
  const c = claveComparacion(valor);
  const m = c.match(/(LUNES|MARTES|MIERCOLES|JUEVES|VIERNES|SABADO|DOMINGO)\s+(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const [, dia, h1, m1, h2, m2] = m;
  return {
    dia,
    horaInicio: horaCivilA24(parseInt(h1, 10), parseInt(m1, 10)),
    horaFin: horaCivilA24(parseInt(h2, 10), parseInt(m2, 10)),
  };
}

// ---------------------------------------------------------------------------
// Fila completa
// ---------------------------------------------------------------------------

export interface FilaOfertaNormalizada {
  fila: number;
  pfgCodigo: string | null;
  tipoPrograma: TipoPrograma;
  trayecto: number | null;
  tramo: number | null;
  ucNombre: string;
  ucCodigo: string | null;
  esElectiva: boolean;
  esProyecto: boolean;
  horas: number | null;
  grupoCodigoOriginal: string;
  grupoCodigo: string;
  cedula: string | null;
  docenteNombre: string | null;
  porAsignar: boolean;
  dedicacion: DedicacionDocente | null;
  escalafon: EscalafonDocente | null;
  condicion: CondicionLaboral | null;
  anioIngreso: number | null;
  anioConcurso: number | null;
  profesion: string | null;
  estudiosCuartoNivel: string | null;
  cantidadEstudiantes: number | null;
  malla: MallaGrupo | null;
  turno: Turno;
  estatus: EstatusGrupo | null;
  seccionesAsesoria: number | null;
  aulaEspecializada: string | null;
  nroEncuentros: number | null;
  centroEstudio: string | null;
  ejeMunicipal: string | null;
  sedeCodigo: string;
  observaciones: string | null;
  horarioObservado: HorarioObservado | null;
  avisos: string[];
  errores: string[];
}

/**
 * Normaliza una fila de la hoja de oferta tolerando columnas corridas
 * (malla en TURNO, turno en ESTATUS, estatus en SECCIONES POR ASESORÍA, dedicación en ESCALAFÓN).
 */
export function normalizarFilaOferta(numeroFila: number, fila: FilaOfertaCruda): FilaOfertaNormalizada {
  const avisos: string[] = [];
  const errores: string[] = [];

  let pfgCodigo = normalizarCodigoPrograma(fila.A);
  if (!pfgCodigo) {
    pfgCodigo = inferirProgramaPorUnidad(fila.D);
    if (pfgCodigo) avisos.push(`Fila sin PFG; se asigna al programa ${pfgCodigo} por la unidad curricular.`);
    else errores.push('Fila sin PFG/programa.');
  }
  const tipoPrograma = inferirTipoPrograma(pfgCodigo);

  const ucNombre = aTitulo(textoCelda(fila.D));
  if (!ucNombre) errores.push('Fila sin nombre de unidad curricular.');

  const grupoCodigoOriginal = textoCelda(fila.F);
  const grupoCodigo = normalizarCodigoGrupo(fila.F);
  if (!grupoCodigo) errores.push('Fila sin código de sección.');

  const ucCodigo = normalizarCodigoUC(fila.G);
  if (!ucCodigo && textoCelda(fila.G) && normalizarTurno(fila.G) !== null) {
    avisos.push(`La columna CÓDIGO U.C. contiene "${textoCelda(fila.G)}" (columna corrida); se generará un código.`);
  }

  let trayecto = romanoAEntero(fila.B);
  let tramo = romanoAEntero(fila.C);
  if (tipoPrograma === TipoPrograma.PFA || tipoPrograma === TipoPrograma.IDIOMAS) {
    trayecto = null;
    tramo = null;
  } else if (trayecto !== null && (trayecto < 0 || trayecto > 5)) {
    avisos.push(`Trayecto ${textoCelda(fila.B)} fuera de rango (0 a 5); se omite.`);
    trayecto = null;
  }
  if (tramo !== null && (tramo < 0 || tramo > 10)) {
    avisos.push(`Tramo ${textoCelda(fila.C)} fuera de rango (0 a 10); se omite.`);
    tramo = null;
  }
  const trayectoDescartado = trayecto === null && textoCelda(fila.B) !== '';
  if ((trayecto !== null || tramo !== null) && !trayectoDescartado) {
    const ajuste = normalizarTrayectoTramo(trayecto, tramo);
    if (ajuste.ajustado && trayecto !== null && tramo !== null) {
      avisos.push(
        ajuste.tramo === null
          ? `Tramo ${tramo} incompatible con Trayecto ${trayecto} (RC-06); se omite el tramo.`
          : `Tramo ${tramo} relativo al Trayecto ${trayecto}; se registra como tramo correlativo ${ajuste.tramo}.`
      );
    }
    trayecto = ajuste.trayecto;
    tramo = ajuste.tramo;
  }

  const horas = enteroPositivo(fila.E);
  if (horas === null) avisos.push('Sin horas semanales declaradas para la unidad curricular.');

  const porAsignar = esDocentePorAsignar(fila.I);
  const cedula = normalizarCedula(fila.H);
  const docenteNombre = porAsignar ? null : textoCelda(fila.I);
  if (!cedula && docenteNombre) avisos.push(`Docente "${docenteNombre}" sin cédula.`);

  const dedicacion = normalizarDedicacion(fila.J) ?? normalizarDedicacion(fila.K);
  const condicion = normalizarCondicion(fila.N);

  const turno =
    normalizarTurno(fila.S) ??
    normalizarTurno(fila.T) ??
    inferirTurnoDesdeCodigoGrupo(grupoCodigo) ??
    Turno.MATUTINO;
  const malla = normalizarMalla(fila.R) ?? normalizarMalla(fila.S);
  const estatus = normalizarEstatus(fila.T) ?? normalizarEstatus(fila.U);

  return {
    fila: numeroFila,
    pfgCodigo,
    tipoPrograma,
    trayecto,
    tramo,
    ucNombre,
    ucCodigo,
    esElectiva: esCodigoElectiva(ucCodigo, ucNombre),
    esProyecto: esUnidadProyecto(ucCodigo, ucNombre),
    horas,
    grupoCodigoOriginal,
    grupoCodigo,
    cedula,
    docenteNombre,
    porAsignar,
    dedicacion,
    escalafon: normalizarEscalafon(fila.K),
    condicion,
    anioIngreso: serialExcelAAnio(fila.L),
    anioConcurso: serialExcelAAnio(fila.M),
    profesion: textoOpcional(fila.O),
    estudiosCuartoNivel: textoOpcional(fila.P),
    cantidadEstudiantes: enteroPositivo(fila.Q),
    malla,
    turno,
    estatus,
    seccionesAsesoria: enteroNoNegativo(fila.U),
    aulaEspecializada: normalizarAulaEspecializada(fila.V),
    nroEncuentros: enteroPositivo(fila.W),
    centroEstudio: normalizarCentroEstudio(fila.Z) ?? normalizarCentroEstudio(fila.AA),
    ejeMunicipal: normalizarEjeMunicipal(fila.AA),
    sedeCodigo: normalizarAldea(fila.AB),
    observaciones: textoOpcional(fila.AC),
    horarioObservado: extraerHorarioObservacion(fila.AC),
    avisos,
    errores,
  };
}
