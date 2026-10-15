/**
 * Diagnóstico previo a la optimización (Spec 03): detecta, antes de correr el motor, las causas
 * que con certeza dejarán secciones sin programar (docentes sin franjas declaradas o con menos
 * franjas que bloques, y secciones sin un aula de aforo suficiente en su sede).
 */

export interface SeccionDiagnostico {
  codigoSeccion: string;
  nombreMateria: string;
  profesorId: string | null;
  profesorNombre: string | null;
  sedeId: string;
  cuposEstimados: number;
  bloquesRequeridos: number;
  tipoEspacioRequerido: string;
  esProyectoComunitario: boolean;
}

export interface EspacioDiagnostico {
  sedeId: string;
  tipo: string;
  capacidad: number;
}

export interface ResultadoDiagnostico {
  docentesAsignados: number;
  docentesConDisponibilidad: number;
  seccionesSinDocente: number;
  seccionesSinAula: number;
  factible: boolean;
  avisos: string[];
}

/** Tolerancia de aforo que el evaluador admite en laboratorios (H-07). */
const TOLERANCIA_AFORO_LAB = 5;

/** Horas semanales de la sección: la oferta manda; si no la trae, se suman las horas de la malla. */
export function horasSemanalesSeccion(
  horasSemanalesOferta: number | null | undefined,
  uc: { horasTeoricasSemanales: number; horasPracticasSemanales: number; horasCampoComunitarioSemanales: number }
): number {
  if (horasSemanalesOferta && horasSemanalesOferta > 0) return horasSemanalesOferta;
  return uc.horasTeoricasSemanales + uc.horasPracticasSemanales + uc.horasCampoComunitarioSemanales;
}

/** Cada bloque oficial dura 90 minutos (2 horas académicas). */
export function bloquesRequeridosPorHoras(horasSemanales: number): number {
  return Math.max(1, Math.round(horasSemanales / 2));
}

function tieneAulaCompatible(sec: SeccionDiagnostico, espacios: EspacioDiagnostico[]): boolean {
  const deSede = espacios.filter((e) => e.sedeId === sec.sedeId);
  if (sec.tipoEspacioRequerido.includes('LAB')) {
    return deSede.some((e) => e.tipo.includes('LAB') && e.capacidad >= sec.cuposEstimados - TOLERANCIA_AFORO_LAB);
  }
  return deSede.some((e) => e.capacidad >= sec.cuposEstimados);
}

export function diagnosticarFactibilidad(
  secciones: SeccionDiagnostico[],
  franjasDisponiblesPorDocente: Map<string, number>,
  espacios: EspacioDiagnostico[]
): ResultadoDiagnostico {
  const avisos: string[] = [];
  const porDocente = new Map<string, { nombre: string; codigos: string[]; bloques: number }>();
  let seccionesSinDocente = 0;
  let seccionesSinAula = 0;

  for (const sec of secciones) {
    if (sec.profesorId) {
      const acumulado = porDocente.get(sec.profesorId) ?? {
        nombre: sec.profesorNombre ?? 'sin nombre registrado',
        codigos: [],
        bloques: 0,
      };
      acumulado.codigos.push(sec.codigoSeccion);
      acumulado.bloques += sec.bloquesRequeridos;
      porDocente.set(sec.profesorId, acumulado);
    } else {
      seccionesSinDocente++;
    }

    if (!sec.esProyectoComunitario && !tieneAulaCompatible(sec, espacios)) {
      seccionesSinAula++;
      avisos.push(
        `La sección ${sec.codigoSeccion} (${sec.nombreMateria}) no tiene en su sede un espacio ${sec.tipoEspacioRequerido.includes('LAB') ? 'de laboratorio ' : ''}con aforo para ${sec.cuposEstimados} cupos.`
      );
    }
  }

  let docentesConDisponibilidad = 0;
  for (const [profesorId, d] of porDocente) {
    const franjas = franjasDisponiblesPorDocente.get(profesorId) ?? 0;
    if (franjas === 0) {
      avisos.push(
        `El docente ${d.nombre} no ha declarado disponibilidad en el período: sus secciones ${d.codigos.join(', ')} no se podrán programar.`
      );
      continue;
    }
    docentesConDisponibilidad++;
    if (franjas < d.bloques) {
      avisos.push(
        `El docente ${d.nombre} declaró ${franjas} franjas disponibles y sus secciones pendientes requieren ${d.bloques} bloques semanales.`
      );
    }
  }

  return {
    docentesAsignados: porDocente.size,
    docentesConDisponibilidad,
    seccionesSinDocente,
    seccionesSinAula,
    factible: avisos.length === 0,
    avisos,
  };
}
