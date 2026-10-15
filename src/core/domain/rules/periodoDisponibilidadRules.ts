/** Fases en que se planifica un período: su disponibilidad es la que usará el optimizador. */
const ESTADOS_EN_PLANIFICACION = ['PLANIFICACION', 'BORRADOR'];

export interface PeriodoCandidato {
  id: string;
  estado: string;
  createdAt: Date;
}

/**
 * Períodos en los que se puede declarar disponibilidad: todos menos los cerrados. Primero los
 * que están en planificación o borrador y luego los activos, cada grupo del más reciente al más antiguo.
 */
export function periodosParaDisponibilidad<T extends PeriodoCandidato>(periodos: T[]): T[] {
  const rango = (p: T) => (ESTADOS_EN_PLANIFICACION.includes(p.estado) ? 0 : 1);
  return periodos
    .filter((p) => p.estado !== 'CERRADO')
    .sort((a, b) => rango(a) - rango(b) || b.createdAt.getTime() - a.createdAt.getTime());
}

/**
 * Período de la matriz de disponibilidad: el solicitado si admite cambios; si no se pidió
 * ninguno, el primero de `periodosParaDisponibilidad`. Un período cerrado o inexistente da null.
 */
export function elegirPeriodoDisponibilidad<T extends PeriodoCandidato>(
  periodos: T[],
  solicitadoId?: string | null
): T | null {
  const abiertos = periodosParaDisponibilidad(periodos);
  if (solicitadoId) return abiertos.find((p) => p.id === solicitadoId) ?? null;
  return abiertos[0] ?? null;
}
