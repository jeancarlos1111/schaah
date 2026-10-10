import { DedicacionDocente } from '../enums';

export interface ParametrosDedicacion {
  minDocencia: number;
  maxDocencia: number;
  minPermanencia: number;
  maxPermanencia: number;
  minProyectoComunidad: number;
  maxProyectoComunidad: number;
  minInvestigacionGestion: number;
  maxInvestigacionGestion: number;
}

export const LIMITES_DEDICACION: Record<string, ParametrosDedicacion> = {
  [DedicacionDocente.DEDICACION_EXCLUSIVA]: {
    minDocencia: 12,
    maxDocencia: 16,
    minPermanencia: 36,
    maxPermanencia: 40,
    minProyectoComunidad: 8,
    maxProyectoComunidad: 12,
    minInvestigacionGestion: 12,
    maxInvestigacionGestion: 16,
  },
  [DedicacionDocente.TIEMPO_COMPLETO]: {
    minDocencia: 8,
    maxDocencia: 12,
    minPermanencia: 30,
    maxPermanencia: 36,
    minProyectoComunidad: 6,
    maxProyectoComunidad: 10,
    minInvestigacionGestion: 12,
    maxInvestigacionGestion: 16,
  },
  [DedicacionDocente.MEDIO_TIEMPO]: {
    minDocencia: 4,
    maxDocencia: 8,
    minPermanencia: 18,
    maxPermanencia: 20,
    minProyectoComunidad: 4,
    maxProyectoComunidad: 6,
    minInvestigacionGestion: 6,
    maxInvestigacionGestion: 8,
  },
  [DedicacionDocente.TIEMPO_CONVENCIONAL]: {
    minDocencia: 2,
    maxDocencia: 12,
    minPermanencia: 2,
    maxPermanencia: 12,
    minProyectoComunidad: 0,
    maxProyectoComunidad: 2,
    minInvestigacionGestion: 0,
    maxInvestigacionGestion: 2,
  },
};

export type EstadoNormativoDocente = 'EN_NORMA' | 'DEFICIT' | 'SOBRECARGA' | 'SIN_ASIGNAR';

export interface EvaluacionNormativaDocente {
  estado: EstadoNormativoDocente;
  horasDocenciaDirecta: number;
  minHoras: number;
  maxHoras: number;
  diferencia: number;
  mensaje: string;
  badgeClass: string;
}

/**
 * Evalúa las restricciones duras H-04 y H-05 sobre la carga lectiva docente
 */
export function evaluarNormativaDocente(
  dedicacion: string,
  horasDocenciaDirecta: number
): EvaluacionNormativaDocente {
  const limites = LIMITES_DEDICACION[dedicacion] || {
    minDocencia: 2,
    maxDocencia: 16,
    minPermanencia: 2,
    maxPermanencia: 40,
    minProyectoComunidad: 0,
    maxProyectoComunidad: 12,
    minInvestigacionGestion: 0,
    maxInvestigacionGestion: 16,
  };

  if (horasDocenciaDirecta === 0) {
    return {
      estado: 'SIN_ASIGNAR',
      horasDocenciaDirecta,
      minHoras: limites.minDocencia,
      maxHoras: limites.maxDocencia,
      diferencia: -limites.minDocencia,
      mensaje: `Docente sin carga horaria asignada (Mínimo requerido: ${limites.minDocencia}h)`,
      badgeClass: 'badge-muted',
    };
  }

  if (horasDocenciaDirecta < limites.minDocencia) {
    const deficit = limites.minDocencia - horasDocenciaDirecta;
    return {
      estado: 'DEFICIT',
      horasDocenciaDirecta,
      minHoras: limites.minDocencia,
      maxHoras: limites.maxDocencia,
      diferencia: -deficit,
      mensaje: `Déficit de ${deficit}h lectivas respecto al mínimo de ${limites.minDocencia}h (Regla H-05)`,
      badgeClass: 'badge-warning',
    };
  }

  if (horasDocenciaDirecta > limites.maxDocencia) {
    const exceso = horasDocenciaDirecta - limites.maxDocencia;
    return {
      estado: 'SOBRECARGA',
      horasDocenciaDirecta,
      minHoras: limites.minDocencia,
      maxHoras: limites.maxDocencia,
      diferencia: exceso,
      mensaje: `Sobrecarga de ${exceso}h lectivas superior al tope de ${limites.maxDocencia}h (Infracción Regla H-04)`,
      badgeClass: 'badge-danger',
    };
  }

  return {
    estado: 'EN_NORMA',
    horasDocenciaDirecta,
    minHoras: limites.minDocencia,
    maxHoras: limites.maxDocencia,
    diferencia: 0,
    mensaje: `Carga lectiva en cumplimiento pleno de la normativa (${horasDocenciaDirecta}h de [${limites.minDocencia}h - ${limites.maxDocencia}h])`,
    badgeClass: 'badge-success',
  };
}
