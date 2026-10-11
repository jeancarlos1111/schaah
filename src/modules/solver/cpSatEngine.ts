import {
  CpModel,
  CpSolver,
  BoolVar,
  setCloudNoticeEnabled,
  sum,
  weightedSum,
} from 'or-tools-wasm/cp-sat';
import {
  BLOQUES_HORARIOS_OFICIALES,
  timeToMinutes,
} from '../../core/domain/rules/timeSlotUtils';
import {
  AsignacionBloquePropuesta,
  EspacioSolverData,
  SeccionSolverData,
  SolverInput,
  SolverOptions,
  SolverResult,
} from './types';
import { evaluarSolucion } from './evaluator';

// Desactivar notice de cloud
setCloudNoticeEnabled(false);

interface VariableDecisionCP {
  seccionId: string;
  bloqueIndice: number;
  dia: string;
  slotIdx: number;
  espacioId: string | null;
  variable: BoolVar;
  prioridadDocente: number;
}

export class CpSatSolverEngine {
  private input: SolverInput;
  private options: Required<SolverOptions>;

  constructor(input: SolverInput, options?: SolverOptions) {
    this.input = input;
    this.options = {
      tamanoPoblacion: options?.tamanoPoblacion ?? 40,
      maxGeneraciones: options?.maxGeneraciones ?? 80,
      tasaMutacion: options?.tasaMutacion ?? 0.15,
      tasaCrossover: options?.tasaCrossover ?? 0.8,
      timeoutMs: options?.timeoutMs ?? 10000,
      motor: options?.motor ?? 'CP_SAT',
    };
  }

  public async resolver(): Promise<SolverResult> {
    const inicioTiempo = Date.now();

    if (this.input.seccionesPendientes.length === 0) {
      return {
        status: 'OPTIMAL',
        fitness: 0,
        asignaciones: [],
        totalSeccionesCalendarizadas: 0,
        totalBloquesAsignados: 0,
        violacionesDuras: [],
        violacionesBlandas: { huecosDocentes: 0, preferenciasBajas: 0, diasExcesivos: 0 },
        metricas: { tiempoMs: 0, generacionesEjecutadas: 0, solucionesEvaluadas: 1 },
      };
    }

    const model = new CpModel();
    const variables: VariableDecisionCP[] = [];
    const diasSemana = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'];

    // Mapear espacios
    const mapaEspacios = new Map(this.input.espacios.map((e) => [e.id, e]));

    // 1. CREACIÓN DE VARIABLES DE DECISIÓN DISCRETAS X[s, b, d, k, e]
    // Solo creamos variables en dominios factibles
    for (const sec of this.input.seccionesPendientes) {
      const espaciosSede = this.input.espacios.filter(
        (e) => e.sedeId === sec.sedeId && e.activa
      );

      let espaciosCandidatos: (EspacioSolverData | null)[] = [];
      if (sec.esProyectoComunitario) {
        // Puede usar espacios de campo o cualquier aula con aforo
        const campoEspacios = espaciosSede.filter(
          (e) => e.tipo === 'ESPACIO_COMUNITARIO_CAMPO' || e.capacidad >= sec.cuposEstimados
        );
        espaciosCandidatos = campoEspacios.length > 0 ? campoEspacios : [null];
      } else {
        const requiereLab = sec.tipoEspacioRequerido.includes('LAB');
        if (requiereLab) {
          espaciosCandidatos = espaciosSede.filter(
            (e) => e.tipo.includes('LAB') && e.capacidad >= sec.cuposEstimados - 5
          );
          if (espaciosCandidatos.length === 0) {
            espaciosCandidatos = espaciosSede.filter((e) => e.tipo.includes('LAB'));
          }
        } else {
          espaciosCandidatos = espaciosSede.filter((e) => {
            const aforoOk = e.capacidad >= sec.cuposEstimados;
            const tipoOk = e.tipo === sec.tipoEspacioRequerido || e.tipo.startsWith('AULA');
            return aforoOk && tipoOk;
          });
          if (espaciosCandidatos.length === 0) {
            espaciosCandidatos = espaciosSede.filter((e) => e.capacidad >= sec.cuposEstimados);
          }
        }
      }

      if (espaciosCandidatos.length === 0) {
        espaciosCandidatos = [null];
      }

      // Slots válidos según docente o turno
      const slotsCandidatos: { dia: string; slotIdx: number; prioridad: number }[] = [];

      if (sec.profesorId && this.input.docentes.has(sec.profesorId)) {
        const doc = this.input.docentes.get(sec.profesorId)!;
        const disps = doc.disponibilidades.filter((d) => d.disponible);

        for (const disp of disps) {
          const idx = BLOQUES_HORARIOS_OFICIALES.findIndex((b) => b.horaInicio === disp.horaInicio);
          if (idx !== -1) {
            slotsCandidatos.push({
              dia: disp.dia,
              slotIdx: idx,
              prioridad: disp.prioridadPreferencia,
            });
          }
        }
      } else {
        for (const dia of diasSemana) {
          BLOQUES_HORARIOS_OFICIALES.forEach((b, idx) => {
            if (sec.turno === 'MATUTINO' && idx <= 2) slotsCandidatos.push({ dia, slotIdx: idx, prioridad: 1 });
            else if (sec.turno === 'VESPERTINO' && idx >= 3 && idx <= 5) slotsCandidatos.push({ dia, slotIdx: idx, prioridad: 1 });
            else if (sec.turno === 'NOCTURNO' && idx >= 6) slotsCandidatos.push({ dia, slotIdx: idx, prioridad: 1 });
            else if (!sec.turno) slotsCandidatos.push({ dia, slotIdx: idx, prioridad: 1 });
          });
        }
      }

      // Crear variables para cada bloque requerido de la sección
      for (let b = 0; b < sec.bloquesRequeridos; b++) {
        const varsBloque: BoolVar[] = [];

        for (const slot of slotsCandidatos) {
          for (const esp of espaciosCandidatos) {
            const espId = esp ? esp.id : null;
            const varName = `X_${sec.codigoSeccion}_b${b}_${slot.dia}_s${slot.slotIdx}_e${esp ? esp.codigo : 'none'}`;
            const v = model.newBoolVar(varName);

            varsBloque.push(v);
            variables.push({
              seccionId: sec.id,
              bloqueIndice: b,
              dia: slot.dia,
              slotIdx: slot.slotIdx,
              espacioId: espId,
              variable: v,
              prioridadDocente: slot.prioridad,
            });
          }
        }

        // RESTRICCIÓN DE INTEGRIDAD: Cada bloque de la sección debe asignarse exactamente una vez
        if (varsBloque.length > 0) {
          model.addExactlyOne(varsBloque);
        }
      }
    }

    // 2. RESTRICCIONES DURAS
    // ----------------------------------------------------
    // H-03: No solapamiento de sección en el mismo día y slot (a lo sumo 1 bloque)
    const varsPorSeccionDiaSlot = new Map<string, BoolVar[]>();
    for (const item of variables) {
      const key = `${item.seccionId}_${item.dia}_${item.slotIdx}`;
      const list = varsPorSeccionDiaSlot.get(key) || [];
      list.push(item.variable);
      varsPorSeccionDiaSlot.set(key, list);
    }
    for (const list of varsPorSeccionDiaSlot.values()) {
      if (list.length > 1) {
        model.addAtMostOne(list);
      }
    }

    // H-01: No solapamiento de docente en el mismo día y slot (a lo sumo 1 bloque)
    const varsPorDocenteDiaSlot = new Map<string, BoolVar[]>();
    for (const item of variables) {
      const sec = this.input.seccionesPendientes.find((s) => s.id === item.seccionId);
      if (sec && sec.profesorId) {
        const key = `${sec.profesorId}_${item.dia}_${item.slotIdx}`;
        const list = varsPorDocenteDiaSlot.get(key) || [];
        list.push(item.variable);
        varsPorDocenteDiaSlot.set(key, list);
      }
    }
    for (const list of varsPorDocenteDiaSlot.values()) {
      if (list.length > 1) {
        model.addAtMostOne(list);
      }
    }

    // H-02: No solapamiento de aula física en el mismo día y slot (a lo sumo 1 bloque)
    const varsPorAulaDiaSlot = new Map<string, BoolVar[]>();
    for (const item of variables) {
      if (item.espacioId) {
        const key = `${item.espacioId}_${item.dia}_${item.slotIdx}`;
        const list = varsPorAulaDiaSlot.get(key) || [];
        list.push(item.variable);
        varsPorAulaDiaSlot.set(key, list);
      }
    }
    for (const list of varsPorAulaDiaSlot.values()) {
      if (list.length > 1) {
        model.addAtMostOne(list);
      }
    }

    // Colisiones con horarios ya existentes en la BD
    for (const h of this.input.horariosExistentes) {
      const slotIdx = BLOQUES_HORARIOS_OFICIALES.findIndex((b) => b.horaInicio === h.horaInicio);
      if (slotIdx === -1) continue;

      // Si el docente ya está ocupado en ese slot
      if (h.profesorId) {
        const key = `${h.profesorId}_${h.dia}_${slotIdx}`;
        const list = varsPorDocenteDiaSlot.get(key);
        if (list && list.length > 0) {
          for (const v of list) {
            model.addEquality(v, 0);
          }
        }
      }

      // Si el aula ya está ocupada en ese slot
      if (h.espacioFisicoId) {
        const key = `${h.espacioFisicoId}_${h.dia}_${slotIdx}`;
        const list = varsPorAulaDiaSlot.get(key);
        if (list && list.length > 0) {
          for (const v of list) {
            model.addEquality(v, 0);
          }
        }
      }
    }

    // 3. FUNCIÓN OBJETIVO (Soft Constraints)
    // Minimizar penalidades de preferencia (Prioridad 3 penaliza con peso 60)
    const varsObjetivo: BoolVar[] = [];
    const pesosObjetivo: number[] = [];

    for (const item of variables) {
      if (item.prioridadDocente === 3) {
        varsObjetivo.push(item.variable);
        pesosObjetivo.push(60);
      }
    }

    if (varsObjetivo.length > 0) {
      model.minimize(weightedSum(varsObjetivo, pesosObjetivo));
    }

    // 4. RESOLUCIÓN CP-SAT
    const solver = new CpSolver();
    const rawStatus = await solver.solve(model);
    const tiempoTotal = Date.now() - inicioTiempo;

    const asignaciones: AsignacionBloquePropuesta[] = [];

    if (rawStatus === 'OPTIMAL' || rawStatus === 'FEASIBLE') {
      for (const item of variables) {
        if (solver.booleanValue(item.variable)) {
          const sec = this.input.seccionesPendientes.find((s) => s.id === item.seccionId)!;
          const bloqueOficial = BLOQUES_HORARIOS_OFICIALES[item.slotIdx];
          const espacio = item.espacioId ? mapaEspacios.get(item.espacioId) : null;
          const doc = sec.profesorId ? this.input.docentes.get(sec.profesorId) : null;

          asignaciones.push({
            seccionId: sec.id,
            codigoSeccion: sec.codigoSeccion,
            nombreMateria: sec.nombreMateria,
            profesorId: sec.profesorId,
            profesorNombre: doc ? doc.nombreCompleto : 'Por Definir',
            espacioFisicoId: item.espacioId,
            codigoEspacio: espacio ? espacio.codigo : (sec.esProyectoComunitario ? 'CAMPO_COMUNITARIO' : 'SIN_AULA'),
            sedeId: sec.sedeId,
            dia: item.dia,
            horaInicio: bloqueOficial.horaInicio,
            horaFin: bloqueOficial.horaFin,
            horaInicio12: bloqueOficial.horaInicio12,
            horaFin12: bloqueOficial.horaFin12,
            tipoBloque: sec.esProyectoComunitario ? 'PROYECTO_COMUNITARIO' : 'DOCENCIA_AULA',
            bloqueIndice: item.bloqueIndice,
          });
        }
      }
    }

    // Evaluación independiente de verificación con evaluator.ts
    const evaluacion = evaluarSolucion(asignaciones, this.input);

    const status: SolverResult['status'] =
      (rawStatus === 'OPTIMAL' || rawStatus === 'FEASIBLE') && evaluacion.esFactible
        ? (rawStatus as SolverResult['status'])
        : 'INFEASIBLE';

    return {
      status,
      fitness: evaluacion.fitness,
      asignaciones,
      totalSeccionesCalendarizadas: this.input.seccionesPendientes.length,
      totalBloquesAsignados: asignaciones.length,
      violacionesDuras: evaluacion.violacionesDuras,
      violacionesBlandas: {
        huecosDocentes: evaluacion.costoBlando.huecosDocentes,
        preferenciasBajas: evaluacion.costoBlando.preferenciasBajas,
        diasExcesivos: evaluacion.costoBlando.diasExcesivos,
      },
      metricas: {
        tiempoMs: tiempoTotal,
        generacionesEjecutadas: 1, // Enfoque branch & bound SAT
        solucionesEvaluadas: 1,
      },
    };
  }
}
