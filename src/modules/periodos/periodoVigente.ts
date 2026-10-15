import prisma from '../../core/database/prisma';

/** Período de trabajo del tablero y de la matriz: el más reciente que no esté cerrado. */
export function buscarPeriodoVigente() {
  return prisma.periodoAcademico.findFirst({
    where: { estado: { in: ['ACTIVO', 'PLANIFICACION', 'BORRADOR'] } },
    orderBy: { createdAt: 'desc' },
  });
}
