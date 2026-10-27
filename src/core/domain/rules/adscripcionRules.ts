import { DiaSemana, DedicacionDocente } from '../enums';
import { LIMITES_DEDICACION } from './dedicacionRules';

export const DIAS_LABORABLES_VALIDOS: DiaSemana[] = [
  DiaSemana.LUNES,
  DiaSemana.MARTES,
  DiaSemana.MIERCOLES,
  DiaSemana.JUEVES,
  DiaSemana.VIERNES,
  DiaSemana.SABADO,
];

/**
 * Valida que el docente tenga seleccionados exactamente 3 días hábiles
 * de acuerdo a lo establecido en la reunión de planificación previa con su coordinador.
 */
export function validarTresDiasDisponibilidad(valor: unknown): {
  valido: boolean;
  dias: DiaSemana[];
  error?: string;
} {
  let diasArray: string[] = [];

  if (Array.isArray(valor)) {
    diasArray = valor.map((d) => String(d).trim().toUpperCase());
  } else if (typeof valor === 'string') {
    try {
      const parsed = JSON.parse(valor);
      if (Array.isArray(parsed)) {
        diasArray = parsed.map((d) => String(d).trim().toUpperCase());
      } else {
        diasArray = valor.split(',').map((d) => d.trim().toUpperCase());
      }
    } catch {
      diasArray = valor.split(',').map((d) => d.trim().toUpperCase());
    }
  }

  // Filtrar solo días válidos y eliminar duplicados
  const diasUnicos = Array.from(new Set(diasArray)).filter((d) =>
    DIAS_LABORABLES_VALIDOS.includes(d as DiaSemana)
  ) as DiaSemana[];

  if (diasUnicos.length !== 3) {
    return {
      valido: false,
      dias: diasUnicos,
      error: `Debe seleccionar exactamente tres (3) días de disponibilidad para el docente (se seleccionaron ${diasUnicos.length}).`,
    };
  }

  // Ordenar días según la semana
  diasUnicos.sort((a, b) => DIAS_LABORABLES_VALIDOS.indexOf(a) - DIAS_LABORABLES_VALIDOS.indexOf(b));

  return {
    valido: true,
    dias: diasUnicos,
  };
}

/**
 * Comprueba si un día específico forma parte de los 3 días acordados del docente.
 */
export function validarDiaEnDisponibilidad(
  dia: string | DiaSemana,
  diasDisponibles: string[] | string | null | undefined
): boolean {
  if (!diasDisponibles) return true; // Si no tiene días configurados, no se restringe por esta vía

  let permitidos: string[] = [];
  if (Array.isArray(diasDisponibles)) {
    permitidos = diasDisponibles.map((d) => d.toUpperCase().trim());
  } else {
    try {
      const parsed = JSON.parse(diasDisponibles);
      if (Array.isArray(parsed)) {
        permitidos = parsed.map((d) => String(d).toUpperCase().trim());
      } else {
        permitidos = diasDisponibles.split(',').map((d) => d.toUpperCase().trim());
      }
    } catch {
      permitidos = diasDisponibles.split(',').map((d) => d.toUpperCase().trim());
    }
  }

  return permitidos.includes(String(dia).toUpperCase().trim());
}

export interface CalculoDisponibilidadDocente {
  maxHorasDocencia: number;
  horasAsignadas: number;
  horasDisponibles: number;
  esProgramaAdscrito: boolean;
  puedeAsumirHoras: (horasNuevas: number) => boolean;
  advertencia?: string;
}

/**
 * Calcula las horas disponibles y la prioridad de asignación del docente según su dedicación
 * y su programa de adscripción.
 */
export function calcularDisponibilidadPorAdscripcion(params: {
  dedicacion: string | null | undefined;
  horasAsignadas: number;
  pfgAdscripcionId?: string | null;
  pfgConsultaId?: string | null;
}): CalculoDisponibilidadDocente {
  const limites = params.dedicacion ? LIMITES_DEDICACION[params.dedicacion] : null;
  const maxHorasDocencia = limites ? limites.maxDocencia : 16;
  const horasAsignadas = Math.max(0, params.horasAsignadas);
  const horasDisponibles = Math.max(0, maxHorasDocencia - horasAsignadas);

  const esProgramaAdscrito = Boolean(
    params.pfgAdscripcionId &&
    params.pfgConsultaId &&
    params.pfgAdscripcionId === params.pfgConsultaId
  );

  return {
    maxHorasDocencia,
    horasAsignadas,
    horasDisponibles,
    esProgramaAdscrito,
    puedeAsumirHoras: (horasNuevas: number) => horasNuevas <= horasDisponibles,
    advertencia:
      horasDisponibles === 0
        ? 'Docente sin horas disponibles de acuerdo a su dedicación máxima.'
        : undefined,
  };
}

export interface DocenteParaOrdenAsignacion {
  id: string;
  nombre: string;
  dedicacion: string | null;
  horas: number;
  maxHoras: number;
  pfgAdscripcionId?: string | null;
}

/**
 * Orden del picker de asignación: docente actual, luego adscritos al PFG de la UC,
 * luego con carga dentro de norma, y por nombre.
 */
export function compararDocentesParaAsignacion(
  a: DocenteParaOrdenAsignacion,
  b: DocenteParaOrdenAsignacion,
  opts: { profesorActualId?: string | null; pfgConsultaId?: string | null }
): number {
  const actual = opts.profesorActualId ?? null;
  if (a.id === actual) return -1;
  if (b.id === actual) return 1;

  const adscrito = (d: DocenteParaOrdenAsignacion) =>
    Boolean(opts.pfgConsultaId && d.pfgAdscripcionId && d.pfgAdscripcionId === opts.pfgConsultaId);
  const prioridadAds = (d: DocenteParaOrdenAsignacion) => (adscrito(d) ? 0 : 1);
  const diffAds = prioridadAds(a) - prioridadAds(b);
  if (diffAds !== 0) return diffAds;

  const rango = (d: DocenteParaOrdenAsignacion) => {
    if (d.dedicacion === null) return 1;
    return d.horas > d.maxHoras ? 2 : 0;
  };
  return rango(a) - rango(b) || a.nombre.localeCompare(b.nombre, 'es');
}
