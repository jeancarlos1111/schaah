import { rangosSeSolapan, to12HourFormat } from './timeSlotUtils';
import { EvaluacionRegla } from './horarioConflictRules';

export const DIA_RESERVA_INSTITUCIONAL = 'MARTES';
export const HORA_INICIO_RESERVA_MARTES = '10:45';
export const HORA_FIN_RESERVA_MARTES = '12:15';

export const DIA_LIDERAZGO = 'JUEVES';
export const HORA_INICIO_LIDERAZGO_1 = '07:30';
export const HORA_FIN_LIDERAZGO_1 = '09:00';
export const HORA_INICIO_LIDERAZGO_2 = '09:05';
export const HORA_FIN_LIDERAZGO_2 = '10:35';

export type TipoLiderazgo = 'LIDERAZGO_1' | 'LIDERAZGO_2';

/**
 * Clasifica si una unidad curricular corresponde a Liderazgo I o Liderazgo II
 * según su nombre o código institucional.
 */
export function clasificarLiderazgo(
  nombreUc?: string | null,
  codigoUc?: string | null
): TipoLiderazgo | null {
  const texto = `${nombreUc ?? ''} ${codigoUc ?? ''}`.trim().toLowerCase();
  if (!texto.includes('lideraz') && !texto.includes('lp-') && !texto.includes('lp1') && !texto.includes('lp2')) {
    return null;
  }

  // Comprobar Liderazgo II / 2
  if (
    /liderazgo.*(2|ii\b|ii$|dos|segund)/i.test(texto) ||
    /\b(lp-?ii|lp-?2)\b/i.test(texto)
  ) {
    return 'LIDERAZGO_2';
  }

  // Comprobar Liderazgo I / 1 (o genérico liderazgo sin 2)
  if (
    /liderazgo.*(1|i\b|i$|uno|primer)/i.test(texto) ||
    /\b(lp-?i|lp-?1)\b/i.test(texto) ||
    /liderazgo/i.test(texto)
  ) {
    return 'LIDERAZGO_1';
  }

  return null;
}

/**
 * Determina si una franja horaria se solapa con la reserva institucional del martes.
 */
export function esFranjaReservaMartes(
  dia: string,
  horaInicio: string,
  horaFin: string
): boolean {
  if (dia.trim().toUpperCase() !== DIA_RESERVA_INSTITUCIONAL) {
    return false;
  }
  return rangosSeSolapan(
    horaInicio,
    horaFin,
    HORA_INICIO_RESERVA_MARTES,
    HORA_FIN_RESERVA_MARTES
  );
}

/**
 * H-13: Reserva Institucional Martes
 * Las dos últimas horas del martes (10:45 AM - 12:15 PM) están reservadas para
 * reuniones de Dirección, PFG, PIU y Formación General.
 */
export function validarH13ReservaMartes(propuesta: {
  dia: string;
  horaInicio: string;
  horaFin: string;
}): EvaluacionRegla {
  if (esFranjaReservaMartes(propuesta.dia, propuesta.horaInicio, propuesta.horaFin)) {
    return {
      valido: false,
      codigoRegla: 'H-13',
      mensaje: `Conflicto H-13 (Reserva Institucional): El día ${DIA_RESERVA_INSTITUCIONAL} de ${to12HourFormat(
        HORA_INICIO_RESERVA_MARTES
      )} a ${to12HourFormat(
        HORA_FIN_RESERVA_MARTES
      )} está reservado institucionalmente para reuniones de Dirección, PFG, PIU y Formación General. Prohibido programar clases.`,
    };
  }
  return { valido: true, codigoRegla: 'H-13' };
}

/**
 * H-14: Bloque Fijo Institucional para Liderazgo
 * - Liderazgo I: Jueves 07:30 AM - 09:00 AM (Bloque 1)
 * - Liderazgo II: Jueves 09:05 AM - 10:35 AM (Bloque 2)
 * - Docente asignado debe tener JUEVES entre sus 3 días disponibles
 */
export function validarH14BloqueFijoLiderazgo(propuesta: {
  dia: string;
  horaInicio: string;
  horaFin: string;
  unidadCurricularNombre?: string;
  codigo?: string;
  diasPermitidosDocente?: string[] | string | null;
}): EvaluacionRegla {
  const tipoLiderazgo = clasificarLiderazgo(
    propuesta.unidadCurricularNombre,
    propuesta.codigo
  );

  if (!tipoLiderazgo) {
    return { valido: true, codigoRegla: 'H-14' };
  }

  const diaPropuesto = propuesta.dia.trim().toUpperCase();

  if (tipoLiderazgo === 'LIDERAZGO_1') {
    const esJuevesBloque1 =
      diaPropuesto === DIA_LIDERAZGO &&
      propuesta.horaInicio === HORA_INICIO_LIDERAZGO_1 &&
      propuesta.horaFin === HORA_FIN_LIDERAZGO_1;

    if (!esJuevesBloque1) {
      return {
        valido: false,
        codigoRegla: 'H-14',
        mensaje: `Conflicto H-14 (Bloque Fijo Institucional): Liderazgo 1 debe programarse exclusivamente los días ${DIA_LIDERAZGO} en el Bloque 1 (${to12HourFormat(
          HORA_INICIO_LIDERAZGO_1
        )} - ${to12HourFormat(HORA_FIN_LIDERAZGO_1)}).`,
      };
    }
  } else if (tipoLiderazgo === 'LIDERAZGO_2') {
    const esJuevesBloque2 =
      diaPropuesto === DIA_LIDERAZGO &&
      propuesta.horaInicio === HORA_INICIO_LIDERAZGO_2 &&
      propuesta.horaFin === HORA_FIN_LIDERAZGO_2;

    if (!esJuevesBloque2) {
      return {
        valido: false,
        codigoRegla: 'H-14',
        mensaje: `Conflicto H-14 (Bloque Fijo Institucional): Liderazgo 2 debe programarse exclusivamente los días ${DIA_LIDERAZGO} en el Bloque 2 (${to12HourFormat(
          HORA_INICIO_LIDERAZGO_2
        )} - ${to12HourFormat(HORA_FIN_LIDERAZGO_2)}).`,
      };
    }
  }

  // Validar que el docente asignado tenga JUEVES disponible
  if (propuesta.diasPermitidosDocente) {
    let permitidos: string[] = [];
    if (Array.isArray(propuesta.diasPermitidosDocente)) {
      permitidos = propuesta.diasPermitidosDocente;
    } else if (typeof propuesta.diasPermitidosDocente === 'string') {
      try {
        permitidos = JSON.parse(propuesta.diasPermitidosDocente);
      } catch {
        permitidos = propuesta.diasPermitidosDocente.split(',').map((d) => d.trim());
      }
    }

    if (permitidos.length > 0 && !permitidos.map((d) => d.toUpperCase()).includes(DIA_LIDERAZGO)) {
      return {
        valido: false,
        codigoRegla: 'H-14',
        mensaje: `Conflicto H-14: El docente asignado a ${propuesta.unidadCurricularNombre || 'Liderazgo'} debe tener el día ${DIA_LIDERAZGO} incluido entre sus días de trabajo acordados.`,
      };
    }
  }

  return { valido: true, codigoRegla: 'H-14' };
}
