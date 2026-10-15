import prisma from '../../core/database/prisma';
import { RolUsuario } from '../../core/domain/enums';

/** Ficha docente de una cuenta DOCENTE: la vinculada en sesión o, en su defecto, la del mismo correo. */
export async function profesorPropioId(usuario?: { rol?: string | null; email?: string | null; profesorId?: string | null } | null) {
  if (!usuario || usuario.rol !== RolUsuario.DOCENTE) return null;
  const propio = await prisma.profesor.findFirst({
    where: { OR: [{ id: usuario.profesorId || '' }, { email: usuario.email || '' }] },
    select: { id: true },
  });
  return propio?.id ?? null;
}
