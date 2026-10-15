import {
  CondicionLaboral,
  DedicacionDocente,
  EscalafonDocente,
  Turno,
} from '../../core/domain/enums';
import { horasDocenciaSeccion } from '../../core/domain/rules/dedicacionRules';
import {
  ALDEA_CVG_GOSH_CODIGO,
  ALDEA_GRAN_SABANA_CODIGO,
  FilaOfertaCruda,
  SEDE_PRINCIPAL_CODIGO,
  codigoProgramaOferta,
} from '../../core/domain/rules/ofertaNormalizacion';

/** Forma mínima de una sección (asignación UC + docente) necesaria para la hoja de oferta. */
export interface SeccionExportable {
  codigoSeccion: string;
  turno: string;
  cuposEstimados: number;
  horasSemanalesOferta: number | null;
  aulaEspecializada: string | null;
  observaciones: string | null;
  sede: { codigo: string; nombre: string; ejeMunicipal: string | null };
  unidadCurricular: {
    codigo: string;
    nombre: string;
    trayecto: number | null;
    tramo: number | null;
    horasTeoricasSemanales: number;
    horasPracticasSemanales: number;
    pfg: { codigo: string };
  };
  grupo: {
    codigo: string;
    codigoNormalizado: string;
    trayecto: number | null;
    tramo: number | null;
    malla: string | null;
    turno: string;
    estatus: string | null;
    cantidadEstudiantes: number | null;
    seccionesAsesoria: number | null;
    nroEncuentros: number | null;
    ejeMunicipal: string | null;
  } | null;
  profesor: {
    cedula: string;
    nombres: string;
    apellidos: string;
    condicion: string;
    escalafon: string;
    profesion: string | null;
    estudiosCuartoNivel: string | null;
    anioIngreso: number | null;
    anioConcurso: number | null;
    centroEstudio: { codigo: string } | null;
    dedicaciones: { dedicacion: string }[];
  } | null;
}

export const EJE_TERRITORIAL_OFERTA = 'KEREPAKUPAI VENA';

const ETIQUETA_DEDICACION: Record<string, string> = {
  [DedicacionDocente.DEDICACION_EXCLUSIVA]: 'EXCLUSIVA',
  [DedicacionDocente.TIEMPO_COMPLETO]: 'TIEMPO COMPLETO',
  [DedicacionDocente.MEDIO_TIEMPO]: 'MEDIO TIEMPO',
  [DedicacionDocente.TIEMPO_CONVENCIONAL]: 'CONVENCIONAL',
};

const ETIQUETA_ESCALAFON: Record<string, string> = {
  [EscalafonDocente.AUXILIAR_DOCENTE]: 'AUXILIAR DOCENTE',
};

const ETIQUETA_CONDICION: Record<string, string> = {
  [CondicionLaboral.ORDINARIO]: 'ORDINARIO',
  [CondicionLaboral.CONTRATADO]: 'CONTRATADO',
  [CondicionLaboral.POR_CONTRATAR]: 'POR CONTRATAR',
  [CondicionLaboral.JUBILADO_ACTIVO]: 'JUBILADO ACTIVO',
  [CondicionLaboral.COMISION_SERVICIO]: 'COMISIÓN DE SERVICIO',
};

const ETIQUETA_TURNO: Record<string, string> = {
  [Turno.MATUTINO]: 'MAÑANA',
  [Turno.VESPERTINO]: 'TARDE',
  [Turno.NOCTURNO]: 'NOCHE',
  [Turno.FIN_DE_SEMANA]: 'FIN DE SEMANA',
  [Turno.UNICA]: 'ÚNICA',
};

export function etiquetaAldea(sede: { codigo: string; nombre: string }): string {
  if (sede.codigo === SEDE_PRINCIPAL_CODIGO) return 'SEDE';
  if (sede.codigo === ALDEA_CVG_GOSH_CODIGO) return 'CVG-GOSH';
  if (sede.codigo === ALDEA_GRAN_SABANA_CODIGO) return 'GRAN SABANA';
  return sede.nombre.toUpperCase();
}

function digitosCedula(cedula: string): number | string {
  const digitos = cedula.replace(/\D/g, '');
  const numero = parseInt(digitos, 10);
  return cedula.trim().toUpperCase().startsWith('E') || Number.isNaN(numero) ? cedula : numero;
}

/** Orden institucional de la hoja: programa, trayecto, sección y unidad curricular. */
export function ordenarSeccionesOferta(secciones: SeccionExportable[]): SeccionExportable[] {
  return [...secciones].sort((a, b) => {
    const pa = codigoProgramaOferta(a.unidadCurricular.pfg.codigo);
    const pb = codigoProgramaOferta(b.unidadCurricular.pfg.codigo);
    if (pa !== pb) return pa.localeCompare(pb);
    const ta = a.grupo?.trayecto ?? a.unidadCurricular.trayecto ?? 99;
    const tb = b.grupo?.trayecto ?? b.unidadCurricular.trayecto ?? 99;
    if (ta !== tb) return ta - tb;
    const ga = a.grupo?.codigoNormalizado ?? a.codigoSeccion;
    const gb = b.grupo?.codigoNormalizado ?? b.codigoSeccion;
    if (ga !== gb) return ga.localeCompare(gb);
    return a.codigoSeccion.localeCompare(b.codigoSeccion);
  });
}

export function construirFilaOferta(s: SeccionExportable): FilaOfertaCruda {
  const uc = s.unidadCurricular;
  const g = s.grupo;
  const p = s.profesor;
  const dedicacion = p?.dedicaciones[0]?.dedicacion;

  return {
    A: codigoProgramaOferta(uc.pfg.codigo),
    B: g?.trayecto ?? uc.trayecto,
    C: g?.tramo ?? uc.tramo,
    D: uc.nombre.toUpperCase(),
    E: horasDocenciaSeccion(s),
    F: g?.codigo ?? s.codigoSeccion,
    G: uc.codigo,
    H: p ? digitosCedula(p.cedula) : null,
    I: p ? `${p.nombres} ${p.apellidos}`.trim().toUpperCase() : 'POR ASIGNAR',
    J: dedicacion ? ETIQUETA_DEDICACION[dedicacion] ?? dedicacion : null,
    K: p ? ETIQUETA_ESCALAFON[p.escalafon] ?? p.escalafon : null,
    L: p?.anioIngreso ?? null,
    M: p?.anioConcurso ?? null,
    N: p ? ETIQUETA_CONDICION[p.condicion] ?? p.condicion : null,
    O: p?.profesion ?? null,
    P: p?.estudiosCuartoNivel ?? null,
    Q: g ? g.cantidadEstudiantes : s.cuposEstimados,
    R: g?.malla ?? null,
    S: ETIQUETA_TURNO[g?.turno ?? s.turno] ?? s.turno,
    T: g?.estatus ?? null,
    U: g?.seccionesAsesoria ?? null,
    V: s.aulaEspecializada,
    W: g?.nroEncuentros ?? null,
    X: EJE_TERRITORIAL_OFERTA,
    Y: null,
    Z: p?.centroEstudio?.codigo ?? null,
    AA: g?.ejeMunicipal ?? s.sede.ejeMunicipal,
    AB: etiquetaAldea(s.sede),
    AC: s.observaciones,
  };
}

export function construirFilasOferta(secciones: SeccionExportable[]): FilaOfertaCruda[] {
  return ordenarSeccionesOferta(secciones).map(construirFilaOferta);
}
