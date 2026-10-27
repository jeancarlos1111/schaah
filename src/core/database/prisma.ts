import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

// Configuración de SQLite en modo WAL (Write-Ahead Logging) para concurrencia óptima
export async function enableSqliteWal() {
  try {
    await prisma.$queryRawUnsafe('PRAGMA journal_mode = WAL;');
    await prisma.$queryRawUnsafe('PRAGMA synchronous = NORMAL;');
    await prisma.$queryRawUnsafe('PRAGMA busy_timeout = 5000;');
    console.log('[PRISMA-SQLITE] Modo WAL activado con éxito en SQLite.');
  } catch (error) {
    console.error('[PRISMA-SQLITE] Error activando modo WAL:', error);
  }
}

export { prisma };
export default prisma;
