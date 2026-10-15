import { RolUsuario } from '../enums';
import { AlcancePfg, puedeGestionarPfg } from './alcancePfgRules';
import { to12HourFormat } from './timeSlotUtils';

/**
 * Quién edita la disponibilidad de un docente (Spec 06): el propio docente sin más trámite;
 * Administración y Dirección, la de cualquiera; el Coordinador, la de los docentes con
 * asignaciones de sus programas en el período. Quien edita la de otro debe dejar un motivo,
 * que queda en el historial auditable (por ejemplo, una emergencia del docente).
 */
export interface UsuarioDisponibilidad {
  rol?: string | null;
  /** Ficha docente vinculada a la cuenta (resuelta por `profesorId` o por correo). */
  profesorIdPropio?: string | null;
}

export interface PermisoDisponibilidad {
  permitido: boolean;
  requiereMotivo: boolean;
}

export const LONGITUD_MINIMA_MOTIVO = 10;

const DENEGADO: PermisoDisponibilidad = { permitido: false, requiereMotivo: false };

export function permisoDisponibilidad(
  usuario: UsuarioDisponibilidad | null | undefined,
  profesorId: string,
  pfgIdsDelDocente: string[],
  alcance: AlcancePfg
): PermisoDisponibilidad {
  if (!usuario?.rol) return DENEGADO;
  switch (usuario.rol) {
    case RolUsuario.DOCENTE:
      return usuario.profesorIdPropio === profesorId ? { permitido: true, requiereMotivo: false } : DENEGADO;
    case RolUsuario.ADMINISTRADOR:
    case RolUsuario.DIRECTOR_ACADEMICO:
      return { permitido: true, requiereMotivo: true };
    case RolUsuario.COORDINADOR_PFG:
      return pfgIdsDelDocente.some((pfgId) => puedeGestionarPfg(alcance, pfgId))
        ? { permitido: true, requiereMotivo: true }
        : DENEGADO;
    default:
      return DENEGADO;
  }
}

/** Motivo normalizado, o un mensaje de error si se exige y no alcanza la longitud mínima. */
export function validarMotivo(
  requiereMotivo: boolean,
  valor: unknown
): { valido: true; motivo: string | null } | { valido: false; error: string } {
  const motivo = typeof valor === 'string' ? valor.trim().replace(/\s+/g, ' ') : '';
  if (!requiereMotivo) return { valido: true, motivo: motivo || null };
  if (motivo.length < LONGITUD_MINIMA_MOTIVO) {
    return {
      valido: false,
      error: `Indique el motivo del cambio (al menos ${LONGITUD_MINIMA_MOTIVO} caracteres): no se guardaron cambios.`,
    };
  }
  return { valido: true, motivo };
}

export interface FranjaDisponibilidad {
  dia: string;
  horaInicio: string;
  horaFin: string;
  disponible?: boolean;
  prioridad: number;
}

export interface ComparacionDisponibilidad {
  hayCambios: boolean;
  agregadas: string[];
  quitadas: string[];
  cambiosPrioridad: { franja: string; antes: number; despues: number }[];
  resumen: string;
}

const ORDEN_DIAS = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO'];

/** Solo las franjas disponibles, una por día y hora, ordenadas por día y hora. */
export function normalizarFranjas(franjas: FranjaDisponibilidad[]): FranjaDisponibilidad[] {
  const porClave = new Map<string, FranjaDisponibilidad>();
  for (const f of franjas) {
    if (f.disponible === false) continue;
    porClave.set(`${f.dia}|${f.horaInicio}`, {
      dia: f.dia,
      horaInicio: f.horaInicio,
      horaFin: f.horaFin,
      prioridad: f.prioridad,
    });
  }
  return [...porClave.values()].sort(
    (a, b) => ORDEN_DIAS.indexOf(a.dia) - ORDEN_DIAS.indexOf(b.dia) || a.horaInicio.localeCompare(b.horaInicio)
  );
}

const etiquetaFranja = (f: FranjaDisponibilidad) => `${f.dia} ${to12HourFormat(f.horaInicio)}`;

function cantidad(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

export function compararDisponibilidad(
  anteriores: FranjaDisponibilidad[],
  nuevas: FranjaDisponibilidad[]
): ComparacionDisponibilidad {
  const antes = new Map(normalizarFranjas(anteriores).map((f) => [`${f.dia}|${f.horaInicio}`, f]));
  const despues = normalizarFranjas(nuevas);
  const clavesDespues = new Set(despues.map((f) => `${f.dia}|${f.horaInicio}`));

  const agregadas: string[] = [];
  const cambiosPrioridad: ComparacionDisponibilidad['cambiosPrioridad'] = [];
  for (const f of despues) {
    const previa = antes.get(`${f.dia}|${f.horaInicio}`);
    if (!previa) agregadas.push(etiquetaFranja(f));
    else if (previa.prioridad !== f.prioridad) {
      cambiosPrioridad.push({ franja: etiquetaFranja(f), antes: previa.prioridad, despues: f.prioridad });
    }
  }
  const quitadas = [...antes.entries()].filter(([clave]) => !clavesDespues.has(clave)).map(([, f]) => etiquetaFranja(f));

  const partes = [
    agregadas.length ? cantidad(agregadas.length, 'franja agregada', 'franjas agregadas') : '',
    quitadas.length ? cantidad(quitadas.length, 'franja quitada', 'franjas quitadas') : '',
    cambiosPrioridad.length ? cantidad(cambiosPrioridad.length, 'cambio de prioridad', 'cambios de prioridad') : '',
  ].filter(Boolean);

  return {
    hayCambios: partes.length > 0,
    agregadas,
    quitadas,
    cambiosPrioridad,
    resumen: partes.length ? partes.join(', ') : 'Sin cambios',
  };
}
