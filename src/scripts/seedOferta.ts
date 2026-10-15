import prisma, { enableSqliteWal } from '../core/database/prisma';
import { CENTROS_ESTUDIO_UBV } from '../core/domain/rules/ofertaNormalizacion';

/**
 * Catálogos requeridos por la oferta de carga horaria 2026-II:
 * centros de estudio UBV y el período académico 2026-II (en borrador hasta su aprobación).
 * Las sedes, ejes municipales y la aldea CVG-GOSH se siembran con seedEspacios.
 */
async function main() {
  console.log('[SEED-OFERTA] Conectando a base de datos...');
  await enableSqliteWal();

  for (const [codigo, nombre] of Object.entries(CENTROS_ESTUDIO_UBV)) {
    await prisma.centroEstudio.upsert({
      where: { codigo },
      update: { nombre, activo: true },
      create: { codigo, nombre },
    });
    console.log(`[SEED-OFERTA] Centro de estudio asegurado: ${codigo} - ${nombre}`);
  }

  const periodo = await prisma.periodoAcademico.upsert({
    where: { codigo: '2026-II' },
    update: {},
    create: {
      codigo: '2026-II',
      nombre: 'Período Académico 2026-II (Semestral)',
      fechaInicio: new Date('2026-09-14'),
      fechaFin: new Date('2027-01-29'),
      estado: 'BORRADOR',
    },
  });
  console.log(`[SEED-OFERTA] Período asegurado: ${periodo.codigo} (${periodo.estado})`);

  console.log('[SEED-OFERTA] Catálogos de la oferta 2026-II sembrados con éxito.');
}

main()
  .catch((e) => {
    console.error('[SEED-OFERTA] Error sembrando catálogos de la oferta:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
