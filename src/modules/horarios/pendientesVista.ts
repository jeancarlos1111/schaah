export type TipoVistaMatriz = 'DOCENTE' | 'AULA' | 'SECCION' | 'GRUPO';

export interface SeccionPendienteInput {
  id: string;
  profesorId: string | null;
  grupoId: string | null;
  sedeId: string;
  horarios: unknown[];
}

/**
 * Asignaciones sin horario que tiene sentido arrastrar a la matriz de la vista activa:
 * las del docente, las de la propia asignación, las de la cohorte o las de la sede del aula.
 */
export function pendientesDeVista<T extends SeccionPendienteInput>(
  secciones: T[],
  tipo: string,
  id: string | null | undefined,
  espacios: { id: string; sedeId: string }[] = []
): T[] {
  const pendientes = secciones.filter((s) => s.horarios.length === 0);
  if (!id) return pendientes;
  switch (tipo) {
    case 'DOCENTE':
      return pendientes.filter((s) => s.profesorId === id);
    case 'SECCION':
      return pendientes.filter((s) => s.id === id);
    case 'GRUPO':
      return pendientes.filter((s) => s.grupoId === id);
    case 'AULA': {
      const sedeId = espacios.find((e) => e.id === id)?.sedeId;
      return sedeId ? pendientes.filter((s) => s.sedeId === sedeId) : pendientes;
    }
    default:
      return pendientes;
  }
}
