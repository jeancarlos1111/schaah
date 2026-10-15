import { randomUUID } from 'crypto';
import { AnalisisOferta } from './OfertaImportService';

export interface VistaPreviaOferta extends AnalisisOferta {
  periodoId: string;
  usuarioId: string;
  nombreArchivo: string;
  creadaEn: number;
}

const VIGENCIA_MS = 30 * 60 * 1000;
const vistasPrevias = new Map<string, VistaPreviaOferta>();

function purgarVencidas(ahora = Date.now()) {
  for (const [token, vista] of vistasPrevias) {
    if (ahora - vista.creadaEn > VIGENCIA_MS) vistasPrevias.delete(token);
  }
}

export function guardarVistaPrevia(vista: Omit<VistaPreviaOferta, 'creadaEn'>): string {
  purgarVencidas();
  const token = randomUUID();
  vistasPrevias.set(token, { ...vista, creadaEn: Date.now() });
  return token;
}

/** Devuelve la vista previa solo si pertenece al usuario y período indicados y no ha vencido. */
export function obtenerVistaPrevia(
  token: string | undefined,
  usuarioId: string,
  periodoId: string
): VistaPreviaOferta | null {
  purgarVencidas();
  if (!token) return null;
  const vista = vistasPrevias.get(token);
  if (!vista || vista.usuarioId !== usuarioId || vista.periodoId !== periodoId) return null;
  return vista;
}

export function descartarVistaPrevia(token: string | undefined): void {
  if (token) vistasPrevias.delete(token);
}
