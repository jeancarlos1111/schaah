import { calcularBrechaMinutos, rangosSeSolapan, to12HourFormat } from './timeSlotUtils';
import { BloqueHorarioExistente, EvaluacionRegla, PropuestaBloqueHorario } from './horarioConflictRules';

export const MINUTOS_MINIMOS_TRASLADO_SEDE = 90;

export interface PropuestaConSede extends PropuestaBloqueHorario {
  sedeId?: string | null;
  sedeNombre?: string | null;
}

/**
 * H-09: Antiteletransportación Territorial
 * Si un docente tiene clases en dos sedes o aldeas distintas el mismo día,
 * debe existir una brecha mínima de traslado de al menos 90 minutos
 * entre el fin de una y el inicio de la otra.
 */
export function validarH09AntiteletransportacionSede(
  propuesta: PropuestaConSede,
  bloquesExistentes: BloqueHorarioExistente[]
): EvaluacionRegla {
  if (!propuesta.profesorId || !propuesta.sedeId) {
    return { valido: true, codigoRegla: 'H-09' };
  }

  // Clases del mismo profesor el mismo día en SEDE DISTINTA
  const clasesMismoDiaDistintaSede = bloquesExistentes.filter(
    (b) =>
      b.id !== propuesta.horarioIdExcluir &&
      b.profesorId === propuesta.profesorId &&
      b.dia === propuesta.dia &&
      b.sedeId &&
      b.sedeId !== propuesta.sedeId
  );

  for (const b of clasesMismoDiaDistintaSede) {
    // Si se solapan ya fallará H-01, pero si no se solapan, evaluar la brecha
    if (rangosSeSolapan(propuesta.horaInicio, propuesta.horaFin, b.horaInicio, b.horaFin)) {
      continue; // H-01 lo maneja
    }

    // Caso A: La clase propuesta es DESPUÉS de la clase existente 'b'
    // brecha = inicioPropuesta - finExistente
    const brechaDespues = calcularBrechaMinutos(b.horaFin, propuesta.horaInicio);
    if (brechaDespues >= 0 && brechaDespues < MINUTOS_MINIMOS_TRASLADO_SEDE) {
      const fin12 = to12HourFormat(b.horaFin);
      const inicio12 = to12HourFormat(propuesta.horaInicio);
      return {
        valido: false,
        codigoRegla: 'H-09',
        mensaje: `Conflicto H-09 (Antiteletransportación): El docente termina en "${b.sedeNombre || 'otra sede'}" a las ${fin12} y la nueva clase en "${propuesta.sedeNombre || 'esta sede'}" inicia a las ${inicio12}. La brecha de ${brechaDespues} minutos es menor a los 90 minutos requeridos para traslado interterritorial.`,
        detalle: { brechaMinutos: brechaDespues, bloquePrevio: b },
      };
    }

    // Caso B: La clase propuesta es ANTES de la clase existente 'b'
    // brecha = inicioExistente - finPropuesta
    const brechaAntes = calcularBrechaMinutos(propuesta.horaFin, b.horaInicio);
    if (brechaAntes >= 0 && brechaAntes < MINUTOS_MINIMOS_TRASLADO_SEDE) {
      const fin12 = to12HourFormat(propuesta.horaFin);
      const inicio12 = to12HourFormat(b.horaInicio);
      return {
        valido: false,
        codigoRegla: 'H-09',
        mensaje: `Conflicto H-09 (Antiteletransportación): La clase propuesta termina a las ${fin12} y el docente debe estar en "${b.sedeNombre || 'otra sede'}" a las ${inicio12}. La brecha de ${brechaAntes} minutos es insuficiente para el traslado territorial (mínimo 90 minutos).`,
        detalle: { brechaMinutos: brechaAntes, bloqueSiguiente: b },
      };
    }
  }

  return { valido: true, codigoRegla: 'H-09' };
}
