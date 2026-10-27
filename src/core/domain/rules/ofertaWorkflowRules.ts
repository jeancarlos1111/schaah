import { RolUsuario } from '../enums';

export enum EstadoPeriodoOferta {
  BORRADOR = 'BORRADOR',
  REGISTRO_OFERTAS = 'REGISTRO_OFERTAS',
  PLANIFICACION = 'PLANIFICACION',
  OFERTA_APROBADA = 'OFERTA_APROBADA',
  ACTIVO = 'ACTIVO',
  PUBLICADA = 'PUBLICADA',
  CERRADO = 'CERRADO',
}

/**
 * Estados del período en los cuales la ventana de oferta académica está formalmente abierta
 * para que los coordinadores de PFG carguen o modifiquen sus secciones, docentes y turnos.
 */
export const ESTADOS_VENTANA_OFERTA_ABIERTA: string[] = [
  EstadoPeriodoOferta.BORRADOR,
  EstadoPeriodoOferta.REGISTRO_OFERTAS,
  EstadoPeriodoOferta.PLANIFICACION,
];

/**
 * Determina si un usuario según su rol y el estado del período puede registrar,
 * modificar o eliminar secciones y asignaciones docentes en la oferta académica.
 */
export function puedeRegistrarOferta(
  estadoPeriodo: string | null | undefined,
  rol: string | null | undefined
): boolean {
  if (!rol || !estadoPeriodo) return false;

  const est = estadoPeriodo.trim().toUpperCase();

  // El período cerrado es histórico e inmutable para todos
  if (est === EstadoPeriodoOferta.CERRADO) return false;

  // Administrador y Planificador tienen potestad continua de ajuste institucional
  if (rol === RolUsuario.ADMINISTRADOR || rol === RolUsuario.PLANIFICADOR || rol === RolUsuario.DIRECTOR_ACADEMICO) {
    return true;
  }

  // El Coordinador de PFG solo puede registrar oferta dentro de la ventana de oferta abierta
  if (rol === RolUsuario.COORDINADOR_PFG) {
    return ESTADOS_VENTANA_OFERTA_ABIERTA.includes(est);
  }

  return false;
}

export interface ResultadoTransicionEstado {
  valido: boolean;
  error?: string;
}

/**
 * Valida la transición de estado del período académico según RBAC y el flujo oficial:
 * BORRADOR -> REGISTRO_OFERTAS -> OFERTA_APROBADA -> ACTIVO/PUBLICADA -> CERRADO.
 */
export function validarTransicionEstadoPeriodo(
  estadoActual: string,
  nuevoEstado: string,
  rol: string | null | undefined
): ResultadoTransicionEstado {
  if (rol !== RolUsuario.ADMINISTRADOR && rol !== RolUsuario.PLANIFICADOR && rol !== RolUsuario.DIRECTOR_ACADEMICO) {
    return {
      valido: false,
      error: 'Solo la Administración o el Planificador tienen autorización para modificar el estado del período académico.',
    };
  }

  const act = estadoActual.trim().toUpperCase();
  const nue = nuevoEstado.trim().toUpperCase();

  if (act === nue) {
    return { valido: true };
  }

  const mapaTransicionesValidas: Record<string, string[]> = {
    [EstadoPeriodoOferta.BORRADOR]: [
      EstadoPeriodoOferta.REGISTRO_OFERTAS,
      EstadoPeriodoOferta.PLANIFICACION,
      EstadoPeriodoOferta.CERRADO,
    ],
    [EstadoPeriodoOferta.REGISTRO_OFERTAS]: [
      EstadoPeriodoOferta.OFERTA_APROBADA,
      EstadoPeriodoOferta.PLANIFICACION,
      EstadoPeriodoOferta.BORRADOR,
      EstadoPeriodoOferta.CERRADO,
    ],
    [EstadoPeriodoOferta.PLANIFICACION]: [
      EstadoPeriodoOferta.OFERTA_APROBADA,
      EstadoPeriodoOferta.REGISTRO_OFERTAS,
      EstadoPeriodoOferta.ACTIVO,
      EstadoPeriodoOferta.PUBLICADA,
      EstadoPeriodoOferta.CERRADO,
    ],
    [EstadoPeriodoOferta.OFERTA_APROBADA]: [
      EstadoPeriodoOferta.ACTIVO,
      EstadoPeriodoOferta.PUBLICADA,
      EstadoPeriodoOferta.PLANIFICACION,
      EstadoPeriodoOferta.REGISTRO_OFERTAS,
      EstadoPeriodoOferta.CERRADO,
    ],
    [EstadoPeriodoOferta.ACTIVO]: [
      EstadoPeriodoOferta.CERRADO,
      EstadoPeriodoOferta.OFERTA_APROBADA,
    ],
    [EstadoPeriodoOferta.PUBLICADA]: [
      EstadoPeriodoOferta.CERRADO,
      EstadoPeriodoOferta.OFERTA_APROBADA,
    ],
    [EstadoPeriodoOferta.CERRADO]: [
      EstadoPeriodoOferta.BORRADOR, // Reapertura excepcional administrativa
    ],
  };

  const permitidos = mapaTransicionesValidas[act] || [];
  if (!permitidos.includes(nue)) {
    return {
      valido: false,
      error: `Transición de estado no permitida: no se puede cambiar de ${act} a ${nue}.`,
    };
  }

  return { valido: true };
}

export interface MetricasPrerrequisitos {
  docentesActivos: number;
  espaciosActivos: number;
  unidadesCurricularesActivas: number;
}

/**
 * Valida los prerrequisitos del sistema antes de habilitar el Registro de Ofertas:
 * Se exige contar con planta docente cargada, espacios físicos activos y mallas curriculares vigentes.
 */
export function validarPrerrequisitosApertura(
  metricas: MetricasPrerrequisitos
): { listo: boolean; detalles: string[] } {
  const detalles: string[] = [];

  if (metricas.docentesActivos === 0) {
    detalles.push('No hay docentes activos registrados para asignación.');
  }
  if (metricas.espaciosActivos === 0) {
    detalles.push('No hay aulas o espacios físicos activos registrados en las sedes.');
  }
  if (metricas.unidadesCurricularesActivas === 0) {
    detalles.push('No hay unidades curriculares activas configuradas en las mallas de los PFG.');
  }

  return {
    listo: detalles.length === 0,
    detalles,
  };
}
