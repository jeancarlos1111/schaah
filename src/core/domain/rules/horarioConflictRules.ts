import { rangosSeSolapan, to12HourFormat } from './timeSlotUtils';

export interface EvaluacionRegla {
  valido: boolean;
  codigoRegla: string;
  mensaje?: string;
  detalle?: any;
}

export interface BloqueHorarioExistente {
  id: string;
  seccionId: string;
  profesorId?: string | null;
  profesorNombre?: string | null;
  espacioFisicoId?: string | null;
  espacioFisicoNombre?: string | null;
  dia: string;
  horaInicio: string;
  horaFin: string;
  codigoSeccion?: string;
  unidadCurricularNombre?: string;
  sedeId?: string;
  sedeNombre?: string;
}

export interface PropuestaBloqueHorario {
  horarioIdExcluir?: string; // Para no autocompararse en modificaciones
  seccionId: string;
  profesorId?: string | null;
  espacioFisicoId?: string | null;
  dia: string;
  horaInicio: string;
  horaFin: string;
  esProyectoComunitario?: boolean;
}

/**
 * H-01: No Solapamiento Docente
 * Un docente no puede dictar dos clases ni estar en aula/campo al mismo tiempo.
 */
export function validarH01NoSolapamientoDocente(
  propuesta: PropuestaBloqueHorario,
  bloquesExistentes: BloqueHorarioExistente[]
): EvaluacionRegla {
  if (!propuesta.profesorId) {
    return { valido: true, codigoRegla: 'H-01' };
  }

  const conflicto = bloquesExistentes.find(
    (b) =>
      b.id !== propuesta.horarioIdExcluir &&
      b.profesorId === propuesta.profesorId &&
      b.dia === propuesta.dia &&
      rangosSeSolapan(propuesta.horaInicio, propuesta.horaFin, b.horaInicio, b.horaFin)
  );

  if (conflicto) {
    const inicio12 = to12HourFormat(conflicto.horaInicio);
    const fin12 = to12HourFormat(conflicto.horaFin);
    const prof = conflicto.profesorNombre ? ` (${conflicto.profesorNombre})` : '';
    return {
      valido: false,
      codigoRegla: 'H-01',
      mensaje: `Conflicto H-01: El docente${prof} ya tiene clase asignada el ${conflicto.dia} de ${inicio12} a ${fin12} en la sección ${conflicto.codigoSeccion || ''}.`,
      detalle: conflicto,
    };
  }

  return { valido: true, codigoRegla: 'H-01' };
}

/**
 * H-02: No Solapamiento de Aula
 * Un recinto físico no puede albergar más de una sección al mismo tiempo.
 */
export function validarH02NoSolapamientoAula(
  propuesta: PropuestaBloqueHorario,
  bloquesExistentes: BloqueHorarioExistente[]
): EvaluacionRegla {
  if (!propuesta.espacioFisicoId) {
    return { valido: true, codigoRegla: 'H-02' };
  }

  const conflicto = bloquesExistentes.find(
    (b) =>
      b.id !== propuesta.horarioIdExcluir &&
      b.espacioFisicoId === propuesta.espacioFisicoId &&
      b.dia === propuesta.dia &&
      rangosSeSolapan(propuesta.horaInicio, propuesta.horaFin, b.horaInicio, b.horaFin)
  );

  if (conflicto) {
    const inicio12 = to12HourFormat(conflicto.horaInicio);
    const fin12 = to12HourFormat(conflicto.horaFin);
    const aula = conflicto.espacioFisicoNombre ? ` [${conflicto.espacioFisicoNombre}]` : '';
    return {
      valido: false,
      codigoRegla: 'H-02',
      mensaje: `Conflicto H-02: El aula física${aula} ya está ocupada el ${conflicto.dia} de ${inicio12} a ${fin12} por la sección ${conflicto.codigoSeccion || ''}.`,
      detalle: conflicto,
    };
  }

  return { valido: true, codigoRegla: 'H-02' };
}

/**
 * H-03: No Solapamiento de Sección
 * Una misma sección no puede tener dos unidades curriculares programadas al mismo tiempo.
 */
export function validarH03NoSolapamientoSeccion(
  propuesta: PropuestaBloqueHorario,
  bloquesExistentes: BloqueHorarioExistente[]
): EvaluacionRegla {
  const conflicto = bloquesExistentes.find(
    (b) =>
      b.id !== propuesta.horarioIdExcluir &&
      b.seccionId === propuesta.seccionId &&
      b.dia === propuesta.dia &&
      rangosSeSolapan(propuesta.horaInicio, propuesta.horaFin, b.horaInicio, b.horaFin)
  );

  if (conflicto) {
    const inicio12 = to12HourFormat(conflicto.horaInicio);
    const fin12 = to12HourFormat(conflicto.horaFin);
    return {
      valido: false,
      codigoRegla: 'H-03',
      mensaje: `Conflicto H-03: Los estudiantes de la sección ya tienen programada la unidad curricular "${conflicto.unidadCurricularNombre || 'otra materia'}" el ${conflicto.dia} de ${inicio12} a ${fin12}.`,
      detalle: conflicto,
    };
  }

  return { valido: true, codigoRegla: 'H-03' };
}

/**
 * H-08: Adecuación de Espacio / Proyecto Comunitario
 * Las unidades de Proyecto Comunitario se ejecutan en interacción sociocomunitaria
 * y no deben reservar espacio físico universitario, pero sí bloquean la disponibilidad docente.
 */
export function validarH08AdecuacionEspacio(
  propuesta: PropuestaBloqueHorario
): EvaluacionRegla {
  if (propuesta.esProyectoComunitario && propuesta.espacioFisicoId) {
    return {
      valido: false,
      codigoRegla: 'H-08',
      mensaje: `Conflicto H-08: La unidad curricular es Proyecto Comunitario (trabajo de campo). No debe reservar aula física en el campus.`,
    };
  }

  return { valido: true, codigoRegla: 'H-08' };
}
