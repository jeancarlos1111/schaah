import { BloqueHorarioOficial } from '../../core/domain/rules/timeSlotUtils';
import { EvaluacionRegla } from '../../core/domain/rules/horarioConflictRules';

export interface DisponibilidadDocenteSolver {
  dia: string;
  horaInicio: string;
  horaFin: string;
  disponible: boolean;
  prioridadPreferencia: number;
}

export interface DocenteSolverData {
  id: string;
  cedula: string;
  nombreCompleto: string;
  dedicacion?: string;
  minHorasDocenciaDirecta?: number;
  maxHorasDocenciaDirecta?: number;
  sedePrincipalId?: string;
  disponibilidades: DisponibilidadDocenteSolver[];
}

export interface EspacioSolverData {
  id: string;
  codigo: string;
  nombre: string;
  tipo: string;
  capacidad: number;
  sedeId: string;
  activa: boolean;
}

export interface SeccionSolverData {
  id: string;
  grupoId?: string | null;
  grupoCodigo?: string | null;
  codigoSeccion: string;
  unidadCurricularId: string;
  nombreMateria: string;
  sedeId: string;
  profesorId: string | null;
  profesorNombre?: string;
  turno: string;
  cuposEstimados: number;
  totalHorasAcademicas: number;
  bloquesRequeridos: number; // Cantidad de bloques de 90 min
  tipoEspacioRequerido: string;
  esProyectoComunitario: boolean;
}

export interface BloqueOcupadoExistente {
  id: string;
  seccionId: string;
  codigoSeccion?: string;
  grupoId?: string | null;
  grupoCodigo?: string | null;
  profesorId?: string | null;
  espacioFisicoId?: string | null;
  sedeId: string;
  dia: string;
  horaInicio: string;
  horaFin: string;
}

export interface SolverInput {
  periodoId: string;
  seccionesPendientes: SeccionSolverData[];
  docentes: Map<string, DocenteSolverData>;
  espacios: EspacioSolverData[];
  horariosExistentes: BloqueOcupadoExistente[];
  /** Nombre visible de cada sede, para que los mensajes no muestren identificadores internos. */
  nombresSedes?: Map<string, string>;
}

export interface AsignacionBloquePropuesta {
  seccionId: string;
  codigoSeccion: string;
  nombreMateria: string;
  profesorId: string | null;
  profesorNombre: string;
  espacioFisicoId: string | null;
  codigoEspacio: string;
  sedeId: string;
  dia: string;
  horaInicio: string;
  horaFin: string;
  horaInicio12: string;
  horaFin12: string;
  tipoBloque: string;
  bloqueIndice: number;
}

export interface SolverOptions {
  tamanoPoblacion?: number;
  maxGeneraciones?: number;
  tasaMutacion?: number;
  tasaCrossover?: number;
  timeoutMs?: number;
  motor?: 'GENETICO' | 'CP_SAT';
}

export type SolverStatus = 'OPTIMAL' | 'FEASIBLE' | 'INFEASIBLE';

export interface SolverResult {
  status: SolverStatus;
  fitness: number;
  asignaciones: AsignacionBloquePropuesta[];
  totalSeccionesCalendarizadas: number;
  totalBloquesAsignados: number;
  violacionesDuras: EvaluacionRegla[];
  violacionesBlandas: {
    huecosDocentes: number;
    preferenciasBajas: number;
    diasExcesivos: number;
  };
  metricas: {
    tiempoMs: number;
    generacionesEjecutadas: number;
    solucionesEvaluadas: number;
    motorUtilizado?: 'GENETICO' | 'CP_SAT';
  };
  diagnosticoCuelloBotella?: string[];
}
