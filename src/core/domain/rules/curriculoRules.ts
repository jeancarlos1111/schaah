import { TipoEspacio, TipoPrograma } from '../enums';

export interface UnidadCurricularData {
  codigo: string;
  nombre: string;
  trayecto: number;
  tramo: number;
  creditos: number;
  horasTeoricasSemanales: number;
  horasPracticasSemanales: number;
  horasCampoComunitarioSemanales: number;
  tipoEspacioRequerido: string;
  esProyectoComunitario: boolean;
}

export interface BloquesLectivosResult {
  horasLectivasSemanales: number; // HT + HP
  horasCampoComunitario: number;  // HC
  totalHorasAcademicas: number;   // HT + HP + HC
  bloques90Min: number;           // Bloques de 2 horas académicas (90 min)
  horasRemanentes: number;        // Horas que no completan bloque de 2h
  requiereEspacioFisico: boolean;
}

/**
 * RC-03: Cómputo de horas lectivas a planificar semanalmente en matriz de horarios.
 * Solo HT + HP demandan aula física. HC se computa en dedicación docente sin saturar aulas.
 */
export function calcularBloquesLectivos(
  horasTeoricas: number,
  horasPracticas: number,
  horasCampo: number = 0,
  esProyecto: boolean = false
): BloquesLectivosResult {
  const ht = Math.max(0, Math.floor(horasTeoricas || 0));
  const hp = Math.max(0, Math.floor(horasPracticas || 0));
  const hc = Math.max(0, Math.floor(horasCampo || 0));

  const horasLectivasSemanales = ht + hp;
  const totalHorasAcademicas = horasLectivasSemanales + hc;

  // En régimen UBV, 1 bloque estándar = 2 horas académicas (90 minutos)
  const bloques90Min = Math.floor(horasLectivasSemanales / 2);
  const horasRemanentes = horasLectivasSemanales % 2;

  // Si es proyecto comunitario puro sin horas de aula, no requiere espacio físico obligatorio
  const requiereEspacioFisico = !esProyecto || horasLectivasSemanales > 0;

  return {
    horasLectivasSemanales,
    horasCampoComunitario: hc,
    totalHorasAcademicas,
    bloques90Min,
    horasRemanentes,
    requiereEspacioFisico,
  };
}

/**
 * Valida la distribución de carga horaria de una unidad curricular.
 * Exige HT + HP + HC > 0 y valores enteros no negativos.
 */
export function validarDistribucionHoras(
  horasTeoricas: number,
  horasPracticas: number,
  horasCampo: number = 0
): { valido: boolean; error?: string } {
  if (horasTeoricas < 0 || horasPracticas < 0 || horasCampo < 0) {
    return { valido: false, error: 'Las horas no pueden ser valores negativos.' };
  }

  const total = (horasTeoricas || 0) + (horasPracticas || 0) + (horasCampo || 0);
  if (total <= 0) {
    return {
      valido: false,
      error: 'La unidad curricular debe tener al menos una hora asignada (HT + HP + HC > 0).',
    };
  }

  return { valido: true };
}

/**
 * RC-04 y RC-05: Valida la tipología requerida de espacio.
 * Si es proyecto comunitario, admite espacio físico nulo o ESPACIO_COMUNITARIO_CAMPO.
 */
export function validarEspacioRequerido(
  tipoEspacio: string,
  esProyecto: boolean
): { valido: boolean; tipoEspacioAjustado: string; error?: string } {
  const tiposValidos = Object.values(TipoEspacio) as string[];

  if (esProyecto && (!tipoEspacio || tipoEspacio === TipoEspacio.ESPACIO_COMUNITARIO_CAMPO)) {
    return {
      valido: true,
      tipoEspacioAjustado: TipoEspacio.ESPACIO_COMUNITARIO_CAMPO,
    };
  }

  if (!tiposValidos.includes(tipoEspacio)) {
    return {
      valido: false,
      tipoEspacioAjustado: tipoEspacio,
      error: `Tipo de espacio "${tipoEspacio}" no es válido en el sistema.`,
    };
  }

  return {
    valido: true,
    tipoEspacioAjustado: tipoEspacio,
  };
}

/**
 * RC-02: Pertenencia estricta de sección a PFG.
 * Previene asignación cruzada de materias incompatibles.
 */
export function validarPertenenciaSeccionUC(
  pfgIdSeccion: string,
  pfgIdUC: string
): { valido: boolean; error?: string } {
  if (!pfgIdSeccion || !pfgIdUC) {
    return { valido: false, error: 'Identificadores de PFG requeridos para validación.' };
  }

  if (pfgIdSeccion !== pfgIdUC) {
    return {
      valido: false,
      error: 'Violación RC-02: La Unidad Curricular no pertenece a la malla del PFG seleccionado.',
    };
  }

  return { valido: true };
}

/**
 * Genera código canónico de sección según Spec 09:
 * SEC-[Período]-[CódigoUC]-[Turno]-[Nro]
 */
export function generarCodigoSeccionSugerido(
  periodoCodigo: string,
  ucCodigo: string,
  turno: string,
  numero: number = 1
): string {
  const limpioPeriodo = (periodoCodigo || 'PER').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
  const limpioUc = (ucCodigo || 'UC').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
  const inicialTurno = (turno || 'M').trim().toUpperCase().charAt(0);
  const nroPadded = String(numero).padStart(2, '0');

  return `SEC-${limpioPeriodo}-${limpioUc}-${inicialTurno}-${nroPadded}`;
}

/**
 * Retorna los tramos semestrales válidos para un trayecto anual UBV.
 * Fórmula UBV: Para Trayecto T >= 1, Tramos = [2T - 1, 2T].
 * Para Trayecto 0 (Inicial/PIU), Tramo = [0, 1].
 */
export function obtenerTramosPorTrayecto(trayecto: number): number[] {
  if (trayecto === 0) {
    return [0, 1];
  }
  if (trayecto >= 1 && trayecto <= 5) {
    return [2 * trayecto - 1, 2 * trayecto];
  }
  return [];
}

/**
 * Deduce el trayecto correspondiente a partir del número de tramo correlativo.
 */
export function obtenerTrayectoPorTramo(tramo: number): number | null {
  if (tramo === 0) return 0;
  if (tramo >= 1 && tramo <= 10) {
    return Math.ceil(tramo / 2);
  }
  return null;
}

/**
 * RC-06 solo aplica a programas organizados por trayectos (PFG, PNF, PIU).
 * PFA (posgrado por cohortes) e IDIOMAS no tienen malla por Trayecto/Tramo.
 */
export function programaRequiereTrayecto(tipoPrograma: string | null | undefined): boolean {
  const tipo = (tipoPrograma || TipoPrograma.PFG).toUpperCase();
  return tipo !== TipoPrograma.PFA && tipo !== TipoPrograma.IDIOMAS;
}

/**
 * RC-06: Valida correspondencia estricta y biunívoca entre Trayecto y Tramo.
 * Previene inconsistencias donde una UC de Trayecto I se registre con Tramo 5 o viceversa.
 */
export function validarCorrespondenciaTrayectoTramo(
  trayecto: number,
  tramo: number
): { valido: boolean; error?: string; tramosPermitidos: number[]; trayectoCorrespondiente?: number } {
  if (typeof trayecto !== 'number' || isNaN(trayecto) || typeof tramo !== 'number' || isNaN(tramo)) {
    return {
      valido: false,
      error: 'Trayecto y Tramo deben ser valores numéricos enteros.',
      tramosPermitidos: [],
    };
  }

  const tramosPermitidos = obtenerTramosPorTrayecto(trayecto);
  if (tramosPermitidos.length === 0) {
    return {
      valido: false,
      error: `Violación RC-06: Trayecto ${trayecto} fuera del rango permitido (0 a 5).`,
      tramosPermitidos: [],
    };
  }

  const trayectoCorrespondiente = obtenerTrayectoPorTramo(tramo);

  if (!tramosPermitidos.includes(tramo)) {
    const sufijoSugerencia = trayectoCorrespondiente !== null
      ? ` El Tramo ${tramo} pertenece al Trayecto ${trayectoCorrespondiente}.`
      : '';
    return {
      valido: false,
      error: `Violación RC-06: El Tramo ${tramo} no corresponde al Trayecto ${trayecto}. Tramos válidos para Trayecto ${trayecto}: [${tramosPermitidos.join(', ')}].${sufijoSugerencia}`,
      tramosPermitidos,
      trayectoCorrespondiente: trayectoCorrespondiente ?? undefined,
    };
  }

  return {
    valido: true,
    tramosPermitidos,
    trayectoCorrespondiente: trayectoCorrespondiente ?? undefined,
  };
}

/**
 * RC-07: Validación de Prelación Curricular entre Unidades del Mismo PFG.
 * - Una materia no puede ser prelación de sí misma.
 * - Ambas materias deben pertenecer al mismo PFG.
 * - La materia requisito debe pertenecer a un Trayecto/Tramo estrictamente anterior.
 */
export function validarReglaPrelacionCurricular(
  unidadObjetivo: { id?: string; pfgId: string; trayecto: number | null; tramo: number | null; nombre?: string },
  unidadRequisito: { id?: string; pfgId: string; trayecto: number | null; tramo: number | null; nombre?: string }
): { valido: boolean; error?: string } {
  if (unidadObjetivo.id && unidadRequisito.id && unidadObjetivo.id === unidadRequisito.id) {
    return {
      valido: false,
      error: 'Violación RC-07: Una unidad curricular no puede establecerse como prelación de sí misma.',
    };
  }

  if (unidadObjetivo.pfgId !== unidadRequisito.pfgId) {
    return {
      valido: false,
      error: 'Violación RC-07: Ambas unidades curriculares deben pertenecer estrictamente al mismo PFG.',
    };
  }

  if (
    unidadObjetivo.trayecto === null || unidadObjetivo.tramo === null ||
    unidadRequisito.trayecto === null || unidadRequisito.tramo === null
  ) {
    return {
      valido: false,
      error: 'Violación RC-07: Las prelaciones solo aplican a unidades curriculares ubicadas en Trayecto/Tramo de la malla.',
    };
  }

  // Comprobar orden cronológico en la malla curricular:
  // La prelación debe ocurrir antes: o trayecto menor, o mismo trayecto con tramo menor
  const esAnterior =
    unidadRequisito.trayecto < unidadObjetivo.trayecto ||
    (unidadRequisito.trayecto === unidadObjetivo.trayecto && unidadRequisito.tramo < unidadObjetivo.tramo);

  if (!esAnterior) {
    return {
      valido: false,
      error: `Violación RC-07: La unidad requisito (Trayecto ${unidadRequisito.trayecto}, Tramo ${unidadRequisito.tramo}) debe cursarse en un Trayecto/Tramo estrictamente anterior a la unidad avanzada (Trayecto ${unidadObjetivo.trayecto}, Tramo ${unidadObjetivo.tramo}).`,
    };
  }

  return { valido: true };
}

export type UbicacionMallaResuelta =
  | { valido: true; trayecto: number | null; tramo: number | null }
  | { valido: false; error: string };

function enteroDeFormulario(valor: unknown): number | null | undefined {
  if (valor === undefined || valor === null) return null;
  const texto = String(valor).trim();
  if (texto === '') return null;
  if (!/^-?\d+$/.test(texto)) return undefined;
  return parseInt(texto, 10);
}

/**
 * Resuelve Trayecto/Tramo enviados desde un formulario según el tipo de programa.
 * PFG, PNF y PIU exigen ambos (RC-06). PFA e IDIOMAS admiten ubicación vacía (null);
 * si se indica alguno de los dos, se exigen ambos y se valida RC-06.
 */
export function resolverUbicacionMalla(
  tipoPrograma: string | null | undefined,
  trayecto: unknown,
  tramo: unknown
): UbicacionMallaResuelta {
  const numTrayecto = enteroDeFormulario(trayecto);
  const numTramo = enteroDeFormulario(tramo);

  if (numTrayecto === undefined || numTramo === undefined) {
    return { valido: false, error: 'Trayecto y Tramo deben ser valores numéricos enteros.' };
  }

  const requiere = programaRequiereTrayecto(tipoPrograma);

  if (numTrayecto === null && numTramo === null) {
    if (!requiere) return { valido: true, trayecto: null, tramo: null };
    return {
      valido: false,
      error: 'Violación RC-06: Los programas organizados por trayectos (PFG, PNF, PIU) requieren Trayecto y Tramo.',
    };
  }

  if (numTrayecto === null || numTramo === null) {
    return {
      valido: false,
      error: requiere
        ? 'Violación RC-06: Debe indicar Trayecto y Tramo de la unidad curricular.'
        : 'Indique Trayecto y Tramo a la vez, o deje ambos vacíos para un programa sin malla por trayectos.',
    };
  }

  const rc06 = validarCorrespondenciaTrayectoTramo(numTrayecto, numTramo);
  if (!rc06.valido) return { valido: false, error: rc06.error! };

  return { valido: true, trayecto: numTrayecto, tramo: numTramo };
}

export interface UnidadMalla {
  id: string;
  codigo: string;
  pfgId: string;
  trayecto: number | null;
  tramo: number | null;
}

/**
 * RC-07 aplicado a una lista de candidatas: separa las prelaciones admisibles de las rechazadas.
 */
export function filtrarPrelacionesValidas(
  objetivo: UnidadMalla,
  candidatas: UnidadMalla[]
): { aceptadas: string[]; rechazadas: { id: string; codigo: string; error: string }[] } {
  const aceptadas: string[] = [];
  const rechazadas: { id: string; codigo: string; error: string }[] = [];
  const vistas = new Set<string>();

  for (const candidata of candidatas) {
    if (vistas.has(candidata.id)) continue;
    vistas.add(candidata.id);
    const v = validarReglaPrelacionCurricular(objetivo, candidata);
    if (v.valido) aceptadas.push(candidata.id);
    else rechazadas.push({ id: candidata.id, codigo: candidata.codigo, error: v.error! });
  }

  return { aceptadas, rechazadas };
}

/**
 * RC-07 inverso: unidades que dependen de `requisito` y dejarían de cumplir la prelación
 * si `requisito` pasa a la ubicación indicada.
 */
export function dependientesInvalidadas(requisito: UnidadMalla, dependientes: UnidadMalla[]): UnidadMalla[] {
  return dependientes.filter((d) => !validarReglaPrelacionCurricular(d, requisito).valido);
}

