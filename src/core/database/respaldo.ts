import { PrismaClient } from '@prisma/client';
import { mkdirSync, readdirSync, unlinkSync } from 'fs';
import path from 'path';

export const DIRECTORIO_RESPALDOS = path.resolve(process.cwd(), process.env.SAHAD_DIRECTORIO_RESPALDOS || 'backups');
export const RESPALDOS_CONSERVADOS = 30;
const PATRON_RESPALDO = /^sahad_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-\d{3}_[a-z0-9-]+\.db$/;

export class RespaldoNoSoportadoError extends Error {}

export function esBaseSqlite(url = process.env.DATABASE_URL ?? ''): boolean {
  return url.startsWith('file:');
}

/** sahad_AAAA-MM-DD_HH-mm-ss-SSS_etiqueta.db (hora UTC); el orden alfabético coincide con el cronológico. */
export function nombreRespaldo(etiqueta: string, fecha = new Date()): string {
  const sello = fecha.toISOString().replace('T', '_').replace(/[:.]/g, '-').slice(0, 23);
  const limpia =
    etiqueta
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+/, '')
      .slice(0, 60)
      .replace(/-+$/, '') || 'manual';
  return `sahad_${sello}_${limpia}.db`;
}

/** Etiqueta del respaldo previo a aplicar una oferta: el nombre del libro sin ruta ni extensión. */
export function etiquetaRespaldoOferta(nombreArchivo: string): string {
  const base = path.basename(nombreArchivo.replace(/\\/g, '/'));
  return `antes-oferta-${base.replace(/\.[^.]+$/, '')}`;
}

/** Elimina los respaldos más antiguos y conserva los `conservar` más recientes. Devuelve los eliminados. */
export function rotarRespaldos(directorio: string, conservar = RESPALDOS_CONSERVADOS): string[] {
  const respaldos = readdirSync(directorio)
    .filter((f) => PATRON_RESPALDO.test(f))
    .sort()
    .reverse();
  const sobrantes = respaldos.slice(Math.max(0, conservar));
  sobrantes.forEach((f) => unlinkSync(path.join(directorio, f)));
  return sobrantes;
}

/**
 * Copia consistente de la base SQLite con VACUUM INTO: incluye las páginas pendientes del WAL,
 * a diferencia de copiar el archivo .db mientras el servidor está escribiendo.
 */
export async function respaldarBaseDatos(
  prisma: PrismaClient,
  opciones: { etiqueta?: string; directorio?: string; conservar?: number; url?: string } = {}
): Promise<string> {
  if (!esBaseSqlite(opciones.url)) {
    throw new RespaldoNoSoportadoError('El respaldo automático solo está disponible para bases SQLite (DATABASE_URL="file:...").');
  }
  const directorio = opciones.directorio ?? DIRECTORIO_RESPALDOS;
  mkdirSync(directorio, { recursive: true });
  const destino = path.join(directorio, nombreRespaldo(opciones.etiqueta ?? 'manual'));
  await prisma.$executeRawUnsafe(`VACUUM INTO '${destino.replace(/'/g, "''")}'`);
  rotarRespaldos(directorio, opciones.conservar ?? RESPALDOS_CONSERVADOS);
  return destino;
}
