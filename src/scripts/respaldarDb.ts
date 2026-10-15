import prisma from '../core/database/prisma';
import { DIRECTORIO_RESPALDOS, RESPALDOS_CONSERVADOS, respaldarBaseDatos } from '../core/database/respaldo';

/**
 * Uso: tsx src/scripts/respaldarDb.ts [etiqueta]
 * Para restaurar: detener el servidor y copiar el respaldo sobre prisma/dev.db (borrando dev.db-wal y dev.db-shm).
 */
async function main() {
  const etiqueta = process.argv[2] ?? 'manual';
  const destino = await respaldarBaseDatos(prisma, { etiqueta });
  console.log(`[RESPALDO] Base de datos respaldada en ${destino}`);
  console.log(`[RESPALDO] Se conservan los ${RESPALDOS_CONSERVADOS} respaldos más recientes en ${DIRECTORIO_RESPALDOS}.`);
}

main()
  .catch((e) => {
    console.error('[RESPALDO] Error:', e.message || e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
