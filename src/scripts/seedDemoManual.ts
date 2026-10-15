import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import path from 'path';
import prisma from '../core/database/prisma';
import { copiarBaseDemo, RUTA_BASE_DEMO, sembrarDemoManual, verificarDestinoDemo } from '../core/database/demoManual';

/**
 * Base de demostración para las capturas del manual de usuario: copia la base de trabajo a
 * prisma/demo-manual.db y siembra allí disponibilidad docente del PFG-INFO y una sección para
 * el usuario docente de prueba. La base de trabajo no se modifica.
 *
 * Uso: pnpm manual:demo  (destino alternativo: SAHAD_DEMO_URL="file:/ruta/demo.db")
 */
async function main() {
  const urlOrigen = process.env.DATABASE_URL ?? 'file:./dev.db';
  const urlDestino = process.env.SAHAD_DEMO_URL ?? `file:${RUTA_BASE_DEMO}`;
  const destino = verificarDestinoDemo(urlDestino, urlOrigen);

  await copiarBaseDemo(prisma, destino);
  console.log(`[DEMO-MANUAL] Copia creada en ${destino}`);

  const demo = new PrismaClient({ datasourceUrl: `file:${destino}` });
  try {
    const resumen = await sembrarDemoManual(demo);
    console.log(
      `[DEMO-MANUAL] ${resumen.docentesConDisponibilidad} docentes con disponibilidad (${resumen.franjasCreadas} franjas) ` +
        `en ${resumen.seccionesPfg} secciones; ${resumen.aulasAgregadas} aulas teóricas agregadas; ` +
        `sección del docente de prueba: ${resumen.seccionDocente ?? 'ninguna'}.`
    );
    console.log(
      `[DEMO-MANUAL] Levante el servidor con: DATABASE_URL="file:${path.relative(path.resolve('prisma'), destino)}" pnpm dev`
    );
  } finally {
    await demo.$disconnect();
  }
}

main()
  .catch((e) => {
    console.error('[DEMO-MANUAL] Error preparando la base de demostración:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
