import {
  BLOQUES_HORARIOS_OFICIALES,
  diasPorTurno,
  indicesBloquesPorTurno,
} from '../../core/domain/rules/timeSlotUtils';
import { claveCohorte } from '../../core/domain/rules/horarioConflictRules';
import {
  clasificarLiderazgo,
  esFranjaReservaMartes,
  DIA_LIDERAZGO,
  HORA_INICIO_LIDERAZGO_1,
  HORA_INICIO_LIDERAZGO_2,
} from '../../core/domain/rules/bloquesInstitucionalesRules';
import { evaluarSolucion, EvaluacionResultado } from './evaluator';
import {
  AsignacionBloquePropuesta,
  EspacioSolverData,
  SeccionSolverData,
  SolverInput,
  SolverOptions,
  SolverResult,
} from './types';

interface GenAsignacion {
  seccionId: string;
  bloqueIndice: number; // 0, 1, 2... de los requeridos por la sección
  dia: string;
  oficialSlotIndex: number; // 0 a 7 (índice en BLOQUES_HORARIOS_OFICIALES)
  espacioId: string | null;
}

type Individuo = GenAsignacion[];

interface DominioSeccion {
  seccion: SeccionSolverData;
  slotsValidos: { dia: string; oficialSlotIndex: number; prioridad: number }[];
  espaciosValidos: EspacioSolverData[];
}

export class GeneticSolverEngine {
  private input: SolverInput;
  private options: Required<SolverOptions>;
  private dominios: Map<string, DominioSeccion> = new Map();
  private cuellosDeBotella: string[] = [];

  constructor(input: SolverInput, options?: SolverOptions) {
    this.input = input;
    this.options = {
      tamanoPoblacion: options?.tamanoPoblacion ?? 40,
      maxGeneraciones: options?.maxGeneraciones ?? 80,
      tasaMutacion: options?.tasaMutacion ?? 0.15,
      tasaCrossover: options?.tasaCrossover ?? 0.8,
      timeoutMs: options?.timeoutMs ?? 10000,
      motor: options?.motor ?? 'GENETICO',
    };
  }

  /**
   * Prepara los dominios de búsqueda e identifica cuellos de botella preliminares
   */
  private preprocesarDominios(): void {
    this.dominios.clear();
    this.cuellosDeBotella = [];

    for (const sec of this.input.seccionesPendientes) {
      // 1. Espacios válidos en la sede con aforo suficiente y tipo compatible
      const espaciosSede = this.input.espacios.filter(
        (e) => e.sedeId === sec.sedeId && e.activa
      );

      let espaciosValidos: EspacioSolverData[] = [];
      if (sec.esProyectoComunitario) {
        // H-08: el proyecto comunitario es trabajo de campo y no reserva aula
        espaciosValidos = [];
      } else {
        // Materia regular
        const requiereLab = sec.tipoEspacioRequerido.includes('LAB');
        if (requiereLab) {
          // Filtrar laboratorios de la sede ordenados por mayor capacidad
          espaciosValidos = espaciosSede
            .filter((e) => e.tipo.includes('LAB') && e.capacidad >= sec.cuposEstimados - 5)
            .sort((a, b) => b.capacidad - a.capacidad);

          if (espaciosValidos.length === 0) {
            // Si ningún lab cumple con la tolerancia de 5, tomar todos los labs de la sede
            espaciosValidos = espaciosSede
              .filter((e) => e.tipo.includes('LAB'))
              .sort((a, b) => b.capacidad - a.capacidad);
          }
        } else {
          // Materia teórica
          espaciosValidos = espaciosSede.filter((e) => {
            const aforoOk = e.capacidad >= sec.cuposEstimados;
            const tipoOk = e.tipo === sec.tipoEspacioRequerido || e.tipo.startsWith('AULA');
            return aforoOk && tipoOk;
          });

          if (espaciosValidos.length === 0) {
            espaciosValidos = espaciosSede.filter((e) => e.capacidad >= sec.cuposEstimados);
          }
        }

        // Restricción de piso del docente
        const docAsignado = sec.profesorId ? this.input.docentes.get(sec.profesorId) : null;
        if (docAsignado && docAsignado.pisoMaximo !== null && docAsignado.pisoMaximo !== undefined) {
          const espaciosAccesibles = espaciosValidos.filter((e) => (e.pisoNivel ?? 0) <= docAsignado.pisoMaximo!);
          if (espaciosAccesibles.length > 0) {
            espaciosValidos = espaciosAccesibles;
          }
        }
      }

      if (espaciosValidos.length === 0 && !sec.esProyectoComunitario) {
        this.cuellosDeBotella.push(
          `Infactibilidad en sección ${sec.codigoSeccion} (${sec.nombreMateria}): no hay aulas con aforo suficiente (${sec.cuposEstimados} cupos) en sede seleccionada.`
        );
      }

      // 2. Slots válidos según disponibilidad del profesor asignado o turno
      const slotsValidos: { dia: string; oficialSlotIndex: number; prioridad: number }[] = [];

      if (sec.profesorId && this.input.docentes.has(sec.profesorId)) {
        const doc = this.input.docentes.get(sec.profesorId)!;
        const disps = doc.disponibilidades.filter((d) => d.disponible);

        for (const disp of disps) {
          if (doc.diasDisponibles && doc.diasDisponibles.length > 0 && !doc.diasDisponibles.includes(disp.dia)) {
            continue; // Saltar días que no forman parte de los 3 acordados
          }
          const slotIdx = BLOQUES_HORARIOS_OFICIALES.findIndex(
            (b) => b.horaInicio === disp.horaInicio
          );
          if (slotIdx !== -1) {
            const bOficial = BLOQUES_HORARIOS_OFICIALES[slotIdx];
            // H-13: Reserva Institucional Martes (10:45 AM - 12:15 PM)
            if (bOficial && esFranjaReservaMartes(disp.dia, bOficial.horaInicio, bOficial.horaFin)) {
              continue;
            }
            slotsValidos.push({
              dia: disp.dia,
              oficialSlotIndex: slotIdx,
              prioridad: disp.prioridadPreferencia,
            });
          }
        }

        if (slotsValidos.length < sec.bloquesRequeridos) {
          this.cuellosDeBotella.push(
            `Infactibilidad en docente ${doc.nombreCompleto} para sección ${sec.codigoSeccion}: declaró solo ${slotsValidos.length} bloques disponibles, pero la materia requiere ${sec.bloquesRequeridos} bloques semanales.`
          );
        }
      } else {
        // Docente no preasignado: todos los bloques del turno
        for (const dia of diasPorTurno(sec.turno)) {
          for (const idx of indicesBloquesPorTurno(sec.turno)) {
            const bOficial = BLOQUES_HORARIOS_OFICIALES[idx];
            if (bOficial && esFranjaReservaMartes(dia, bOficial.horaInicio, bOficial.horaFin)) {
              continue;
            }
            slotsValidos.push({ dia, oficialSlotIndex: idx, prioridad: 1 });
          }
        }
      }

      // H-14: Bloque Fijo Institucional para Liderazgo
      const tipoLid = clasificarLiderazgo(sec.nombreMateria);
      if (tipoLid === 'LIDERAZGO_1') {
        const slotsLid1 = slotsValidos.filter(
          (s) =>
            s.dia.toUpperCase() === DIA_LIDERAZGO &&
            BLOQUES_HORARIOS_OFICIALES[s.oficialSlotIndex]?.horaInicio === HORA_INICIO_LIDERAZGO_1
        );
        slotsValidos.length = 0;
        slotsValidos.push(...slotsLid1);
        if (slotsValidos.length === 0) {
          this.cuellosDeBotella.push(
            `Infactibilidad en Liderazgo 1 (${sec.codigoSeccion}): requiere Jueves en Bloque 1 (07:30 AM - 09:00 AM) y no hay franja compatible disponible.`
          );
        }
      } else if (tipoLid === 'LIDERAZGO_2') {
        const slotsLid2 = slotsValidos.filter(
          (s) =>
            s.dia.toUpperCase() === DIA_LIDERAZGO &&
            BLOQUES_HORARIOS_OFICIALES[s.oficialSlotIndex]?.horaInicio === HORA_INICIO_LIDERAZGO_2
        );
        slotsValidos.length = 0;
        slotsValidos.push(...slotsLid2);
        if (slotsValidos.length === 0) {
          this.cuellosDeBotella.push(
            `Infactibilidad en Liderazgo 2 (${sec.codigoSeccion}): requiere Jueves en Bloque 2 (09:05 AM - 10:35 AM) y no hay franja compatible disponible.`
          );
        }
      }

      this.dominios.set(sec.id, {
        seccion: sec,
        slotsValidos,
        espaciosValidos,
      });
    }
  }

  /**
   * Construye un individuo a partir de heurística constructiva (semilla voraz)
   */
  private generarIndividuoVoraz(): Individuo {
    const individuo: Individuo = [];
    const ocupacionLocalDocente = new Set<string>();
    const ocupacionLocalAula = new Set<string>();
    const ocupacionLocalCohorte = new Set<string>();
    for (const h of this.input.horariosExistentes) {
      ocupacionLocalCohorte.add(`${claveCohorte(h)}_${h.dia}_${h.horaInicio}`);
      if (h.profesorId) ocupacionLocalDocente.add(`${h.profesorId}_${h.dia}_${h.horaInicio}`);
      if (h.espacioFisicoId) ocupacionLocalAula.add(`${h.espacioFisicoId}_${h.dia}_${h.horaInicio}`);
    }

    // Ordenar secciones por mayor restricción (MRV: menor cantidad de slots válidos primero)
    const seccionesOrdenadas = [...this.input.seccionesPendientes].sort((a, b) => {
      const domA = this.dominios.get(a.id)?.slotsValidos.length || 999;
      const domB = this.dominios.get(b.id)?.slotsValidos.length || 999;
      return domA - domB;
    });

    for (const sec of seccionesOrdenadas) {
      const dom = this.dominios.get(sec.id);
      if (!dom) continue;

      const diasAsignados = new Set<string>();

      for (let b = 0; b < sec.bloquesRequeridos; b++) {
        let elegidoSlot: { dia: string; oficialSlotIndex: number; prioridad: number } | null = null;
        let elegidoEspacio: EspacioSolverData | null = null;

        // Mezclar slots con preferencia alta primero
        const slotsCandidatos = [...dom.slotsValidos].sort((x, y) => {
          // Favorecer días distintos para la misma sección
          const xUsado = diasAsignados.has(x.dia) ? 1 : 0;
          const yUsado = diasAsignados.has(y.dia) ? 1 : 0;
          if (xUsado !== yUsado) return xUsado - yUsado;
          return x.prioridad - y.prioridad;
        });

        for (const slot of slotsCandidatos) {
          const bloqueOficial = BLOQUES_HORARIOS_OFICIALES[slot.oficialSlotIndex];
          const docKey = sec.profesorId
            ? `${sec.profesorId}_${slot.dia}_${bloqueOficial.horaInicio}`
            : null;

          if (docKey && ocupacionLocalDocente.has(docKey)) {
            continue; // Docente ocupado
          }

          if (ocupacionLocalCohorte.has(`${claveCohorte({ seccionId: sec.id, grupoId: sec.grupoId })}_${slot.dia}_${bloqueOficial.horaInicio}`)) {
            continue; // Estudiantes del grupo ocupados
          }

          // Buscar espacio libre
          const espCandidato = dom.espaciosValidos.find((esp) => {
            const aulaKey = `${esp.id}_${slot.dia}_${bloqueOficial.horaInicio}`;
            return !ocupacionLocalAula.has(aulaKey);
          });

          if (sec.esProyectoComunitario) {
            elegidoSlot = slot;
            elegidoEspacio = null;
            break;
          }
          if (espCandidato) {
            elegidoSlot = slot;
            elegidoEspacio = espCandidato;
            break;
          }
        }

        // Si no encontró slot libre perfecto, asignar el mejor disponible
        if (!elegidoSlot && dom.slotsValidos.length > 0) {
          elegidoSlot = dom.slotsValidos[b % dom.slotsValidos.length];
          elegidoEspacio = dom.espaciosValidos[0] || null;
        }

        if (elegidoSlot) {
          const bloqueOficial = BLOQUES_HORARIOS_OFICIALES[elegidoSlot.oficialSlotIndex];
          if (sec.profesorId) {
            ocupacionLocalDocente.add(`${sec.profesorId}_${elegidoSlot.dia}_${bloqueOficial.horaInicio}`);
          }
          if (elegidoEspacio) {
            ocupacionLocalAula.add(`${elegidoEspacio.id}_${elegidoSlot.dia}_${bloqueOficial.horaInicio}`);
          }
          ocupacionLocalCohorte.add(
            `${claveCohorte({ seccionId: sec.id, grupoId: sec.grupoId })}_${elegidoSlot.dia}_${bloqueOficial.horaInicio}`
          );
          diasAsignados.add(elegidoSlot.dia);

          individuo.push({
            seccionId: sec.id,
            bloqueIndice: b,
            dia: elegidoSlot.dia,
            oficialSlotIndex: elegidoSlot.oficialSlotIndex,
            espacioId: elegidoEspacio ? elegidoEspacio.id : null,
          });
        }
      }
    }

    return individuo;
  }

  /**
   * Genera un individuo con selección aleatoria factible dentro de los dominios
   */
  private generarIndividuoAleatorio(): Individuo {
    const individuo: Individuo = [];

    for (const sec of this.input.seccionesPendientes) {
      const dom = this.dominios.get(sec.id);
      if (!dom || dom.slotsValidos.length === 0) continue;

      const diasAsignados = new Set<string>();

      for (let b = 0; b < sec.bloquesRequeridos; b++) {
        // Filtrar slots para preferir no repetir día si hay suficientes días
        let candidatos = dom.slotsValidos.filter((s) => !diasAsignados.has(s.dia));
        if (candidatos.length === 0) candidatos = dom.slotsValidos;

        const slotRandom = candidatos[Math.floor(Math.random() * candidatos.length)];
        const espacioRandom =
          dom.espaciosValidos.length > 0
            ? dom.espaciosValidos[Math.floor(Math.random() * dom.espaciosValidos.length)]
            : null;

        diasAsignados.add(slotRandom.dia);

        individuo.push({
          seccionId: sec.id,
          bloqueIndice: b,
          dia: slotRandom.dia,
          oficialSlotIndex: slotRandom.oficialSlotIndex,
          espacioId: espacioRandom ? espacioRandom.id : null,
        });
      }
    }

    return individuo;
  }

  /**
   * Transforma genotipo a AsignacionBloquePropuesta para evaluación
   */
  private decodificarIndividuo(individuo: Individuo): AsignacionBloquePropuesta[] {
    const resultado: AsignacionBloquePropuesta[] = [];

    const mapaEspacios = new Map(this.input.espacios.map((e) => [e.id, e]));

    for (const gen of individuo) {
      const sec = this.dominios.get(gen.seccionId)?.seccion;
      if (!sec) continue;

      const bloqueOficial = BLOQUES_HORARIOS_OFICIALES[gen.oficialSlotIndex];
      const espacio = gen.espacioId ? mapaEspacios.get(gen.espacioId) : null;
      const doc = sec.profesorId ? this.input.docentes.get(sec.profesorId) : null;

      resultado.push({
        seccionId: sec.id,
        codigoSeccion: sec.codigoSeccion,
        nombreMateria: sec.nombreMateria,
        profesorId: sec.profesorId,
        profesorNombre: doc ? doc.nombreCompleto : 'Por Definir',
        espacioFisicoId: gen.espacioId,
        codigoEspacio: espacio ? espacio.codigo : (sec.esProyectoComunitario ? 'CAMPO_COMUNITARIO' : 'SIN_AULA'),
        sedeId: sec.sedeId,
        dia: gen.dia,
        horaInicio: bloqueOficial.horaInicio,
        horaFin: bloqueOficial.horaFin,
        horaInicio12: bloqueOficial.horaInicio12,
        horaFin12: bloqueOficial.horaFin12,
        tipoBloque: sec.esProyectoComunitario ? 'PROYECTO_COMUNITARIO' : 'DOCENCIA_AULA',
        bloqueIndice: gen.bloqueIndice,
      });
    }

    return resultado;
  }

  /**
   * Operador Crossover (Cruce uniforme por secciones)
   */
  private crossover(padreA: Individuo, padreB: Individuo): [Individuo, Individuo] {
    const hijo1: Individuo = [];
    const hijo2: Individuo = [];

    const seccionesIds = this.input.seccionesPendientes.map((s) => s.id);

    // Mapear genes por sección
    const genesPadreA = new Map<string, GenAsignacion[]>();
    const genesPadreB = new Map<string, GenAsignacion[]>();

    for (const g of padreA) {
      const list = genesPadreA.get(g.seccionId) || [];
      list.push(g);
      genesPadreA.set(g.seccionId, list);
    }
    for (const g of padreB) {
      const list = genesPadreB.get(g.seccionId) || [];
      list.push(g);
      genesPadreB.set(g.seccionId, list);
    }

    for (const secId of seccionesIds) {
      const swap = Math.random() < 0.5;
      const secA = genesPadreA.get(secId) || [];
      const secB = genesPadreB.get(secId) || [];

      if (swap) {
        hijo1.push(...secB);
        hijo2.push(...secA);
      } else {
        hijo1.push(...secA);
        hijo2.push(...secB);
      }
    }

    return [hijo1, hijo2];
  }

  /**
   * Operador Mutación
   */
  private mutar(individuo: Individuo): Individuo {
    const mutado: Individuo = [];

    for (const gen of individuo) {
      const nuevoGen = { ...gen };

      if (Math.random() < this.options.tasaMutacion) {
        const dom = this.dominios.get(gen.seccionId);
        if (dom) {
          const tipoMutacion = Math.random();

          if (tipoMutacion < 0.6 && dom.slotsValidos.length > 0) {
            // Mutar slot (día / bloque)
            const randomSlot = dom.slotsValidos[Math.floor(Math.random() * dom.slotsValidos.length)];
            nuevoGen.dia = randomSlot.dia;
            nuevoGen.oficialSlotIndex = randomSlot.oficialSlotIndex;
          } else if (dom.espaciosValidos.length > 0) {
            // Mutar espacio físico compatible
            const randomEsp = dom.espaciosValidos[Math.floor(Math.random() * dom.espaciosValidos.length)];
            nuevoGen.espacioId = randomEsp.id;
          }
        }
      }

      mutado.push(nuevoGen);
    }

    return mutado;
  }

  /**
   * Búsqueda Local (Hill Climbing) para pulir huecos y solapamientos
   */
  private busquedaLocal(individuo: Individuo): Individuo {
    let mejor = individuo;
    let mejorEval = evaluarSolucion(this.decodificarIndividuo(mejor), this.input);

    for (let i = 0; i < individuo.length; i++) {
      const gen = individuo[i];
      const dom = this.dominios.get(gen.seccionId);
      if (!dom || dom.slotsValidos.length <= 1) continue;

      // Probar algunos slots alternativos válidos
      const muestraSlots = dom.slotsValidos.slice(0, 4);
      for (const candidatoSlot of muestraSlots) {
        if (
          candidatoSlot.dia === gen.dia &&
          candidatoSlot.oficialSlotIndex === gen.oficialSlotIndex
        ) {
          continue;
        }

        const candidatoIndividuo = [...mejor];
        candidatoIndividuo[i] = {
          ...gen,
          dia: candidatoSlot.dia,
          oficialSlotIndex: candidatoSlot.oficialSlotIndex,
        };

        const evalCandidato = evaluarSolucion(
          this.decodificarIndividuo(candidatoIndividuo),
          this.input
        );

        if (evalCandidato.fitness < mejorEval.fitness) {
          mejor = candidatoIndividuo;
          mejorEval = evalCandidato;
        }
      }
    }

    return mejor;
  }

  /**
   * Ejecuta el Solver de Optimización
   */
  public resolver(): SolverResult {
    const inicioTiempo = Date.now();
    this.preprocesarDominios();

    // Si no hay secciones por programar
    if (this.input.seccionesPendientes.length === 0) {
      return {
        status: 'OPTIMAL',
        fitness: 0,
        asignaciones: [],
        totalSeccionesCalendarizadas: 0,
        totalBloquesAsignados: 0,
        violacionesDuras: [],
        violacionesBlandas: { huecosDocentes: 0, preferenciasBajas: 0, diasExcesivos: 0 },
        metricas: { tiempoMs: 0, generacionesEjecutadas: 0, solucionesEvaluadas: 0 },
      };
    }

    // 1. Inicializar Población
    let poblacion: Individuo[] = [];
    poblacion.push(this.generarIndividuoVoraz()); // Semilla Greedy de alta calidad

    for (let i = 1; i < this.options.tamanoPoblacion; i++) {
      poblacion.push(this.generarIndividuoAleatorio());
    }

    let solucionesEvaluadas = 0;
    let generacionesEjecutadas = 0;
    let mejorIndividuo = poblacion[0];
    let mejorEval = evaluarSolucion(this.decodificarIndividuo(mejorIndividuo), this.input);
    solucionesEvaluadas++;

    // 2. Bucle Evolutivo
    for (let gen = 0; gen < this.options.maxGeneraciones; gen++) {
      generacionesEjecutadas++;

      // Verificar timeout
      if (Date.now() - inicioTiempo > this.options.timeoutMs) {
        break;
      }

      // Evaluar población
      const evaluados = poblacion.map((ind) => {
        const ev = evaluarSolucion(this.decodificarIndividuo(ind), this.input);
        solucionesEvaluadas++;
        return { ind, ev };
      });

      // Ordenar por fitness ascendente (menor es mejor)
      evaluados.sort((a, b) => a.ev.fitness - b.ev.fitness);

      if (evaluados[0].ev.fitness < mejorEval.fitness) {
        mejorIndividuo = evaluados[0].ind;
        mejorEval = evaluados[0].ev;
      }

      // Criterio de parada temprana: solución perfecta factible
      if (mejorEval.fitness === 0) {
        break;
      }

      // Elitismo: conservar los 2 mejores
      const nuevaPoblacion: Individuo[] = [evaluados[0].ind, evaluados[1].ind];

      // Selección por Torneo k=3 y Reproducción
      while (nuevaPoblacion.length < this.options.tamanoPoblacion) {
        const torneo = () => {
          const a = evaluados[Math.floor(Math.random() * evaluados.length)];
          const b = evaluados[Math.floor(Math.random() * evaluados.length)];
          const c = evaluados[Math.floor(Math.random() * evaluados.length)];
          if (a.ev.fitness <= b.ev.fitness && a.ev.fitness <= c.ev.fitness) return a.ind;
          if (b.ev.fitness <= a.ev.fitness && b.ev.fitness <= c.ev.fitness) return b.ind;
          return c.ind;
        };

        const padre1 = torneo();
        const padre2 = torneo();

        let [hijo1, hijo2] =
          Math.random() < this.options.tasaCrossover
            ? this.crossover(padre1, padre2)
            : [[...padre1], [...padre2]];

        hijo1 = this.mutar(hijo1);
        hijo2 = this.mutar(hijo2);

        nuevaPoblacion.push(hijo1);
        if (nuevaPoblacion.length < this.options.tamanoPoblacion) {
          nuevaPoblacion.push(hijo2);
        }
      }

      poblacion = nuevaPoblacion;
    }

    // 3. Paso de Refinamiento Local sobre el mejor individuo encontrado
    mejorIndividuo = this.busquedaLocal(mejorIndividuo);
    const resultadoFinalEval = evaluarSolucion(this.decodificarIndividuo(mejorIndividuo), this.input);

    const asignacionesFinales = this.decodificarIndividuo(mejorIndividuo);
    const tiempoTotal = Date.now() - inicioTiempo;

    const status: SolverResult['status'] =
      resultadoFinalEval.esFactible && resultadoFinalEval.fitness < 500
        ? 'OPTIMAL'
        : resultadoFinalEval.esFactible
        ? 'FEASIBLE'
        : 'INFEASIBLE';

    return {
      status,
      fitness: resultadoFinalEval.fitness,
      asignaciones: asignacionesFinales,
      totalSeccionesCalendarizadas: this.input.seccionesPendientes.length,
      totalBloquesAsignados: asignacionesFinales.length,
      violacionesDuras: resultadoFinalEval.violacionesDuras,
      violacionesBlandas: {
        huecosDocentes: resultadoFinalEval.costoBlando.huecosDocentes,
        preferenciasBajas: resultadoFinalEval.costoBlando.preferenciasBajas,
        diasExcesivos: resultadoFinalEval.costoBlando.diasExcesivos,
      },
      metricas: {
        tiempoMs: tiempoTotal,
        generacionesEjecutadas,
        solucionesEvaluadas,
      },
      diagnosticoCuelloBotella:
        this.cuellosDeBotella.length > 0 ? this.cuellosDeBotella : undefined,
    };
  }
}
