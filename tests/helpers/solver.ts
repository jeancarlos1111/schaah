import { BLOQUES_HORARIOS_OFICIALES } from '../../src/core/domain/rules/timeSlotUtils';
import { Turno } from '../../src/core/domain/enums';
import { AsignacionBloquePropuesta, SeccionSolverData } from '../../src/modules/solver/types';

export function seccionSolver(datos: Partial<SeccionSolverData> & { id: string }): SeccionSolverData {
  return {
    grupoId: null,
    codigoSeccion: datos.id.toUpperCase(),
    unidadCurricularId: `uc-${datos.id}`,
    nombreMateria: `Materia ${datos.id}`,
    sedeId: 'sede',
    profesorId: null,
    turno: Turno.MATUTINO,
    cuposEstimados: 30,
    totalHorasAcademicas: 2,
    bloquesRequeridos: 1,
    tipoEspacioRequerido: 'AULA_TEORICA',
    esProyectoComunitario: false,
    ...datos,
  };
}

/** Bloque propuesto en una franja oficial (`horaInicio` debe ser el inicio de un bloque oficial). */
export function propuestaBloque(
  datos: Pick<AsignacionBloquePropuesta, 'seccionId' | 'dia' | 'horaInicio'> & Partial<AsignacionBloquePropuesta>
): AsignacionBloquePropuesta {
  const oficial = BLOQUES_HORARIOS_OFICIALES.find((b) => b.horaInicio === datos.horaInicio);
  if (!oficial) throw new Error(`${datos.horaInicio} no es el inicio de un bloque oficial`);
  return {
    codigoSeccion: datos.seccionId,
    nombreMateria: datos.seccionId,
    profesorId: null,
    profesorNombre: 'Por Definir',
    espacioFisicoId: null,
    codigoEspacio: 'SIN_AULA',
    sedeId: 'sede',
    horaFin: oficial.horaFin,
    horaInicio12: oficial.horaInicio12,
    horaFin12: oficial.horaFin12,
    tipoBloque: 'DOCENCIA_AULA',
    bloqueIndice: 0,
    ...datos,
  };
}
