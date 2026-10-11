import prisma, { enableSqliteWal } from '../core/database/prisma';
import { DiaSemana, TipoBloqueAcademico } from '../core/domain/enums';
import { BLOQUES_HORARIOS_OFICIALES } from '../core/domain/rules/timeSlotUtils';

async function main() {
  console.log('[SEED-HORARIOS] Inicializando asignación de muestra para matriz semanal...');
  await enableSqliteWal();

  const periodo = await prisma.periodoAcademico.findFirst({
    where: { codigo: '2026-I' },
  });

  if (!periodo) {
    console.error('[SEED-HORARIOS] No se encontró el período 2026-I.');
    return;
  }

  const [secciones, espacios] = await Promise.all([
    prisma.seccion.findMany({
      where: { periodoId: periodo.id },
      include: { unidadCurricular: true, profesor: true },
      take: 4,
    }),
    prisma.espacioFisico.findMany({
      where: { activo: true },
      take: 2,
    }),
  ]);

  if (secciones.length === 0 || espacios.length === 0) {
    console.log('[SEED-HORARIOS] Faltan secciones o espacios para generar horarios de prueba.');
    return;
  }

  // Asignar primer bloque: Lunes Bloque 1 (07:30 AM - 09:00 AM)
  const b1 = BLOQUES_HORARIOS_OFICIALES[0];
  const sec1 = secciones[0];
  const esp1 = espacios[0];

  await prisma.horarioSeccion.create({
    data: {
      seccionId: sec1.id,
      espacioFisicoId: sec1.unidadCurricular.esProyectoComunitario ? null : esp1.id,
      dia: DiaSemana.LUNES,
      horaInicio: b1.horaInicio,
      horaFin: b1.horaFin,
      tipoBloque: sec1.unidadCurricular.esProyectoComunitario
        ? TipoBloqueAcademico.PROYECTO_COMUNITARIO
        : TipoBloqueAcademico.DOCENCIA_AULA,
    },
  });
  console.log(`[SEED-HORARIOS] Asignado: ${sec1.codigoSeccion} el ${DiaSemana.LUNES} a las ${b1.horaInicio12}`);

  // Asignar segundo bloque: Miércoles Bloque 2 (09:05 AM - 10:35 AM)
  if (secciones.length > 1) {
    const b2 = BLOQUES_HORARIOS_OFICIALES[1];
    const sec2 = secciones[1];
    const esp2 = espacios[1] || espacios[0];

    await prisma.horarioSeccion.create({
      data: {
        seccionId: sec2.id,
        espacioFisicoId: sec2.unidadCurricular.esProyectoComunitario ? null : esp2.id,
        dia: DiaSemana.MIERCOLES,
        horaInicio: b2.horaInicio,
        horaFin: b2.horaFin,
        tipoBloque: sec2.unidadCurricular.esProyectoComunitario
          ? TipoBloqueAcademico.PROYECTO_COMUNITARIO
          : TipoBloqueAcademico.DOCENCIA_AULA,
      },
    });
    console.log(`[SEED-HORARIOS] Asignado: ${sec2.codigoSeccion} el ${DiaSemana.MIERCOLES} a las ${b2.horaInicio12}`);
  }

  console.log('[SEED-HORARIOS] Horarios de muestra sembrados exitosamente.');
}

main()
  .catch((e) => {
    console.error('[SEED-HORARIOS] Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
