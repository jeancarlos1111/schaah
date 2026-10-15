import { execFileSync } from 'child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { PrismaClient } from '@prisma/client';

export const RAIZ_PROYECTO = path.resolve(__dirname, '../..');

export interface BaseTemporal {
  url: string;
  directorio: string;
  directorioRespaldos: string;
  prisma: PrismaClient;
  cerrar(): Promise<void>;
}

/**
 * Base SQLite efímera con el esquema real de Prisma. Apunta DATABASE_URL y el directorio de
 * respaldos a ella, de modo que los controladores importados después (que usan el cliente
 * global de `src/core/database/prisma`) trabajen sobre esta base y no sobre `prisma/dev.db`.
 */
export function crearBaseTemporal(prefijo = 'sahad-aceptacion-'): BaseTemporal {
  const directorio = mkdtempSync(path.join(tmpdir(), prefijo));
  const directorioRespaldos = path.join(directorio, 'backups');
  mkdirSync(directorioRespaldos);
  const url = `file:${path.join(directorio, 'sahad.db')}`;
  execFileSync(
    path.join(RAIZ_PROYECTO, 'node_modules/.bin/prisma'),
    ['db', 'push', '--skip-generate', '--schema', 'prisma/schema.prisma'],
    { cwd: RAIZ_PROYECTO, env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' }
  );
  process.env.DATABASE_URL = url;
  process.env.SAHAD_DIRECTORIO_RESPALDOS = directorioRespaldos;
  const prisma = new PrismaClient({ datasourceUrl: url });
  return {
    url,
    directorio,
    directorioRespaldos,
    prisma,
    async cerrar() {
      await prisma.$disconnect();
      const global = (await import('../../src/core/database/prisma')).default;
      await global.$disconnect();
      rmSync(directorio, { recursive: true, force: true });
    },
  };
}

/** Datos mínimos del período 2026-II, la sede central y un programa; devuelve sus ids. */
export async function sembrarPeriodoBase(prisma: PrismaClient) {
  const sede = await prisma.sede.create({
    data: { codigo: 'SEDE', nombre: 'Los Chaguaramos', ejeTerritorial: 'Eje Metropolitano' },
  });
  const periodo = await prisma.periodoAcademico.create({
    data: {
      codigo: '2026-II',
      nombre: 'Período 2026-II',
      fechaInicio: new Date('2026-09-14'),
      fechaFin: new Date('2027-01-29'),
    },
  });
  const pfg = await prisma.programaFormacion.create({
    data: { codigo: 'PFG-INFO', nombre: 'Informática para la Gestión Social', areaConocimiento: 'Tecnología' },
  });
  return { sedeId: sede.id, periodoId: periodo.id, pfgId: pfg.id };
}
