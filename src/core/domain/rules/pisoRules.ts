/**
 * Reglas de dominio para niveles de piso y restricciones de movilidad de docentes.
 * Restricción dura: Un docente con condición de salud/discapacidad no puede ser asignado
 * a un espacio físico con nivel superior a su piso máximo permitido.
 */

export function normalizarNivelPiso(piso: string | number | null | undefined): number {
  if (piso === null || piso === undefined) return 0;
  if (typeof piso === 'number') return Math.max(0, Math.floor(piso));

  const texto = piso.trim().toUpperCase();
  if (texto === '' || texto === 'PB' || texto === 'PLANTA BAJA' || texto === '0' || texto.includes('BAJA')) {
    return 0;
  }

  // Buscar dígitos en el texto ej: "PISO 1", "P1", "NIVEL 2"
  const match = texto.match(/\d+/);
  if (match) {
    const num = parseInt(match[0], 10);
    return isNaN(num) ? 0 : Math.max(0, num);
  }

  return 0;
}

export function validarAccesoPiso(
  pisoMaximoDocente: number | null | undefined,
  nivelPisoRecinto: number | string | null | undefined
): boolean {
  if (pisoMaximoDocente === null || pisoMaximoDocente === undefined) {
    return true; // Sin restricción de movilidad
  }

  const nivelRecinto = typeof nivelPisoRecinto === 'number'
    ? nivelPisoRecinto
    : normalizarNivelPiso(nivelPisoRecinto);

  return nivelRecinto <= pisoMaximoDocente;
}

export function etiquetaPiso(nivel: number | string | null | undefined): string {
  const n = normalizarNivelPiso(nivel);
  if (n === 0) return 'Planta Baja (PB)';
  return `Piso ${n}`;
}
