import {
  BloqueHorarioExistente,
  EvaluacionRegla,
  PropuestaBloqueHorario,
  validarH01NoSolapamientoDocente,
  validarH02NoSolapamientoAula,
  validarH03NoSolapamientoSeccion,
  validarH07NoSolapamientoPrelacion,
  validarH08AdecuacionEspacio,
} from './horarioConflictRules';
import { PropuestaConSede, validarH09AntiteletransportacionSede } from './trasladoSedeRules';
import { to12HourFormat } from './timeSlotUtils';

export interface DisponibilidadDocenteItem {
  profesorId: string;
  dia: string;
  horaInicio: string;
  horaFin: string;
  disponible: boolean;
  prioridadPreferencia: number;
}

export interface ResultadoValidacionHorario {
  esValido: boolean;
  conflictos: EvaluacionRegla[];
  advertencias: string[];
  mensajeResumen: string;
}

/**
 * Validador orquestador del dominio SAHAD UBV
 * Ejecuta la batería de restricciones duras sobre una propuesta de asignación o movimiento.
 */
export function validarAsignacionHoraria(
  propuesta: PropuestaConSede,
  bloquesExistentes: BloqueHorarioExistente[],
  disponibilidadesDocente: DisponibilidadDocenteItem[] = []
): ResultadoValidacionHorario {
  const conflictos: EvaluacionRegla[] = [];
  const advertencias: string[] = [];

  // 1. Evaluar H-01 (No Solapamiento Docente)
  const evalH01 = validarH01NoSolapamientoDocente(propuesta, bloquesExistentes);
  if (!evalH01.valido) conflictos.push(evalH01);

  // 2. Evaluar H-02 (No Solapamiento Aula)
  const evalH02 = validarH02NoSolapamientoAula(propuesta, bloquesExistentes);
  if (!evalH02.valido) conflictos.push(evalH02);

  // 3. Evaluar H-03 (No Solapamiento Sección)
  const evalH03 = validarH03NoSolapamientoSeccion(propuesta, bloquesExistentes);
  if (!evalH03.valido) conflictos.push(evalH03);

  // 4. Evaluar H-07 (No Solapamiento de Prelaciones Curriculares)
  const evalH07 = validarH07NoSolapamientoPrelacion(propuesta, bloquesExistentes);
  if (!evalH07.valido) conflictos.push(evalH07);

  // 5. Evaluar H-08 (Adecuación de Espacio / Proyecto Comunitario)
  const evalH08 = validarH08AdecuacionEspacio(propuesta);
  if (!evalH08.valido) conflictos.push(evalH08);

  // 6. Evaluar H-09 (Antiteletransportación de Sede)
  const evalH09 = validarH09AntiteletransportacionSede(propuesta, bloquesExistentes);
  if (!evalH09.valido) conflictos.push(evalH09);

  // 7. Evaluar H-06 (Disponibilidad Docente Respetada)
  if (propuesta.profesorId && disponibilidadesDocente.length > 0) {
    const disp = disponibilidadesDocente.find(
      (d) =>
        d.profesorId === propuesta.profesorId &&
        d.dia === propuesta.dia &&
        d.horaInicio === propuesta.horaInicio
    );

    if (disp && !disp.disponible) {
      conflictos.push({
        valido: false,
        codigoRegla: 'H-06',
        mensaje: `Conflicto H-06: El docente ha marcado la franja del ${propuesta.dia} a las ${to12HourFormat(propuesta.horaInicio)} como NO DISPONIBLE (indisponibilidad justificada).`,
      });
    } else if (disp && disp.prioridadPreferencia === 3) {
      advertencias.push(
        `Preferencia baja (P3 - Ámbar): El docente prefiere no dictar clases el ${propuesta.dia} a las ${to12HourFormat(propuesta.horaInicio)}, pero la asignación es legalmente factible.`
      );
    }
  }

  const esValido = conflictos.length === 0;
  const mensajeResumen = esValido
    ? 'Asignación horaria válida. Cumple todas las restricciones normativas UBV.'
    : conflictos.map((c) => c.mensaje).join(' | ');

  return {
    esValido,
    conflictos,
    advertencias,
    mensajeResumen,
  };
}
