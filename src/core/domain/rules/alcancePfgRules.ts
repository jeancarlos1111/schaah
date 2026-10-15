import { RolUsuario } from '../enums';

/**
 * Alcance por programa de formación (Spec 06, "Su PFG").
 * ADMINISTRADOR, DIRECTOR_ACADEMICO y DOCENTE no se restringen por programa (el docente
 * no tiene escrituras curriculares); COORDINADOR_PFG solo ve y modifica los programas que
 * tiene asignados en `UsuarioPrograma`. Sin programas asignados no ve ni modifica nada.
 */
export type AlcancePfg = { total: true } | { total: false; pfgIds: string[] };

export const ALCANCE_TOTAL: AlcancePfg = { total: true };

/** Roles que ajustan la matriz y ejecutan el optimizador; los demás la consultan en modo lectura. */
export const ROLES_PROGRAMACION_HORARIOS = [
  RolUsuario.ADMINISTRADOR,
  RolUsuario.DIRECTOR_ACADEMICO,
  RolUsuario.COORDINADOR_PFG,
];

export function puedeProgramarHorarios(rol: string | null | undefined): boolean {
  return ROLES_PROGRAMACION_HORARIOS.some((r) => r === rol);
}

export function alcanceDeUsuario(rol: string | null | undefined, pfgIds: string[]): AlcancePfg {
  if (rol === RolUsuario.COORDINADOR_PFG) {
    return { total: false, pfgIds: [...new Set(pfgIds.filter(Boolean))] };
  }
  return ALCANCE_TOTAL;
}

export function puedeGestionarPfg(alcance: AlcancePfg, pfgId: string | null | undefined): boolean {
  if (alcance.total) return true;
  return !!pfgId && alcance.pfgIds.includes(pfgId);
}

/** Filtro de Prisma para `pfgId` (`undefined` = sin restricción). */
export function filtroPfg(alcance: AlcancePfg): { in: string[] } | undefined {
  return alcance.total ? undefined : { in: alcance.pfgIds };
}

/**
 * Filtro de `pfgId` para un listado con selector de programa opcional: el programa
 * solicitado si está permitido; si es ajeno o no se pidió, todos los permitidos.
 */
export function filtroPfgEfectivo(
  alcance: AlcancePfg,
  solicitado: string | null | undefined,
): string | { in: string[] } | undefined {
  if (solicitado && puedeGestionarPfg(alcance, solicitado)) return solicitado;
  return filtroPfg(alcance);
}

/**
 * Programa a mostrar en vistas que siempre trabajan sobre un único programa (Mallas):
 * el solicitado si está disponible y permitido; si no, el primero permitido.
 */
export function pfgVisible(
  alcance: AlcancePfg,
  solicitado: string | null | undefined,
  disponibles: string[],
): string | undefined {
  const permitidos = disponibles.filter((id) => puedeGestionarPfg(alcance, id));
  if (solicitado && permitidos.includes(solicitado)) return solicitado;
  return permitidos[0];
}

export type ProgramasCoordinadorResueltos =
  | { valido: true; pfgIds: string[] }
  | { valido: false; error: string };

/**
 * Programas a vincular al guardar un usuario: obligatorios (al menos uno) para
 * COORDINADOR_PFG; para cualquier otro rol se descartan los vínculos.
 */
export function resolverProgramasCoordinador(rol: string | null | undefined, valor: unknown): ProgramasCoordinadorResueltos {
  if (rol !== RolUsuario.COORDINADOR_PFG) return { valido: true, pfgIds: [] };
  const lista = (Array.isArray(valor) ? valor : valor === undefined || valor === null ? [] : [valor])
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim())
    .filter(Boolean);
  const pfgIds = [...new Set(lista)];
  if (pfgIds.length === 0) {
    return { valido: false, error: 'Seleccione al menos un programa de formación para el coordinador.' };
  }
  return { valido: true, pfgIds };
}

export function filtrarProgramasPermitidos<T extends { id: string }>(alcance: AlcancePfg, programas: T[]): T[] {
  return alcance.total ? programas : programas.filter((p) => alcance.pfgIds.includes(p.id));
}
