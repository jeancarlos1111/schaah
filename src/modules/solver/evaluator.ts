import {
  BLOQUES_HORARIOS_OFICIALES,
  BloqueHorarioOficial,
  timeToMinutes,
} from '../../core/domain/rules/timeSlotUtils';
import { EvaluacionRegla } from '../../core/domain/rules/horarioConflictRules';
import {
  AsignacionBloquePropuesta,
  BloqueOcupadoExistente,
  DocenteSolverData,
  EspacioSolverData,
  SeccionSolverData,
  SolverInput,
} from './types';

export interface EvaluacionResultado {
  fitness: number; // Menor es mejor (0 = perfecto sin violaciones duras ni penalidades)
  violacionesDuras: EvaluacionRegla[];
  costoBlando: {
    huecosDocentes: number;
    preferenciasBajas: number;
    diasExcesivos: number;
    concentracionMismaSeccion: number;
  };
  esFactible: boolean;
}

const PESO_DURA = 1_000_000;
const PESO_HUECO = 80;
const PESO_PREFERENCIA = 60;
const PESO_DIAS_EXCESIVOS = 70;
const PESO_MISMO_DIA_CONCENTRADO = 30;

/**
 * Evaluador matemático de calidad de horario (Spec 03 UBV)
 */
export function evaluarSolucion(
  propuestas: AsignacionBloquePropuesta[],
  input: SolverInput
): EvaluacionResultado {
  const violacionesDuras: EvaluacionRegla[] = [];
  let costoHuecos = 0;
  let costoPreferencias = 0;
  let costoDiasExcesivos = 0;
  let costoMismoDiaConcentrado = 0;

  // Unificamos bloques asignados propuestos con los bloques existentes ya fijados
  const todosLosBloques: {
    id: string;
    seccionId: string;
    profesorId: string | null;
    espacioFisicoId: string | null;
    sedeId: string;
    dia: string;
    horaInicio: string;
    horaFin: string;
    bloqueIndice: number;
  }[] = [
    ...input.horariosExistentes.map((h) => ({
      id: h.id,
      seccionId: h.seccionId,
      profesorId: h.profesorId || null,
      espacioFisicoId: h.espacioFisicoId || null,
      sedeId: h.sedeId,
      dia: h.dia,
      horaInicio: h.horaInicio,
      horaFin: h.horaFin,
      bloqueIndice: BLOQUES_HORARIOS_OFICIALES.findIndex((b) => b.horaInicio === h.horaInicio),
    })),
    ...propuestas.map((p) => ({
      id: `prop-${p.seccionId}-${p.bloqueIndice}`,
      seccionId: p.seccionId,
      profesorId: p.profesorId,
      espacioFisicoId: p.espacioFisicoId,
      sedeId: p.sedeId,
      dia: p.dia,
      horaInicio: p.horaInicio,
      horaFin: p.horaFin,
      bloqueIndice: p.bloqueIndice,
    })),
  ];

  // 1. RESTRICCIONES DURAS
  // ----------------------------------------------------
  // H-01: No solapamiento de docente (mismo profesor, mismo día y horaInicio)
  const ocupacionDocente = new Map<string, string[]>(); // key: `${profesorId}_${dia}_${horaInicio}` -> [seccionId]
  // H-02: No solapamiento de aula (mismo espacioFisico, mismo día y horaInicio)
  const ocupacionAula = new Map<string, string[]>(); // key: `${espacioFisicoId}_${dia}_${horaInicio}` -> [seccionId]
  // H-03: No solapamiento de sección (misma sección, mismo día y horaInicio)
  const ocupacionSeccion = new Map<string, string[]>(); // key: `${seccionId}_${dia}_${horaInicio}` -> [bloqueId]

  for (const b of todosLosBloques) {
    // H-03: Sección
    const secKey = `${b.seccionId}_${b.dia}_${b.horaInicio}`;
    const secList = ocupacionSeccion.get(secKey) || [];
    secList.push(b.id);
    ocupacionSeccion.set(secKey, secList);
    if (secList.length > 1) {
      violacionesDuras.push({
        valido: false,
        codigoRegla: 'H-03',
        mensaje: `Conflicto H-03: La sección ${b.seccionId} tiene más de una clase en ${b.dia} a las ${b.horaInicio}.`,
      });
    }

    // H-01: Docente
    if (b.profesorId) {
      const docKey = `${b.profesorId}_${b.dia}_${b.horaInicio}`;
      const docList = ocupacionDocente.get(docKey) || [];
      docList.push(b.seccionId);
      ocupacionDocente.set(docKey, docList);
      if (docList.length > 1) {
        violacionesDuras.push({
          valido: false,
          codigoRegla: 'H-01',
          mensaje: `Conflicto H-01: El docente ${b.profesorId} tiene asignaciones solapadas el ${b.dia} a las ${b.horaInicio}.`,
        });
      }
    }

    // H-02: Aula (si tiene espacio asignado y no es virtual/comunitario)
    if (b.espacioFisicoId) {
      const aulaKey = `${b.espacioFisicoId}_${b.dia}_${b.horaInicio}`;
      const aulaList = ocupacionAula.get(aulaKey) || [];
      aulaList.push(b.seccionId);
      ocupacionAula.set(aulaKey, aulaList);
      if (aulaList.length > 1) {
        violacionesDuras.push({
          valido: false,
          codigoRegla: 'H-02',
          mensaje: `Conflicto H-02: El espacio ${b.espacioFisicoId} está ocupado por múltiples secciones el ${b.dia} a las ${b.horaInicio}.`,
        });
      }
    }
  }

  // H-06, H-07, H-08 sobre cada propuesta individual
  const mapaEspacios = new Map<string, EspacioSolverData>();
  for (const esp of input.espacios) {
    mapaEspacios.set(esp.id, esp);
  }

  const mapaSecciones = new Map<string, SeccionSolverData>();
  for (const sec of input.seccionesPendientes) {
    mapaSecciones.set(sec.id, sec);
  }

  for (const p of propuestas) {
    const sec = mapaSecciones.get(p.seccionId);
    if (!sec) continue;

    // H-06: Disponibilidad Docente
    if (p.profesorId) {
      const doc = input.docentes.get(p.profesorId);
      if (doc) {
        const disp = doc.disponibilidades.find(
          (d) => d.dia === p.dia && d.horaInicio === p.horaInicio
        );
        if (!disp || !disp.disponible) {
          violacionesDuras.push({
            valido: false,
            codigoRegla: 'H-06',
            mensaje: `Conflicto H-06: El docente ${doc.nombreCompleto} no tiene disponibilidad para el ${p.dia} a las ${p.horaInicio}.`,
          });
        } else if (disp.prioridadPreferencia === 3) {
          costoPreferencias += PESO_PREFERENCIA;
        }
      }
    }

    // H-07 y H-08: Aforo y Tipo de Espacio
    if (p.espacioFisicoId) {
      const esp = mapaEspacios.get(p.espacioFisicoId);
      if (esp) {
        // H-08 Tipo de espacio (Estricto: laboratorios no van a aulas teóricas ni campo)
        if (!sec.esProyectoComunitario) {
          const requiereLab = sec.tipoEspacioRequerido.includes('LAB');
          const tieneLab = esp.tipo.includes('LAB');
          if (requiereLab && !tieneLab) {
            violacionesDuras.push({
              valido: false,
              codigoRegla: 'H-08',
              mensaje: `Conflicto H-08: La materia ${sec.nombreMateria} requiere laboratorio especializado (${sec.tipoEspacioRequerido}) pero se asignó ${esp.tipo}.`,
            });
          }
        }

        // H-07 Aforo: Tolerancia operacional de hasta 5 cupos en laboratorios
        const deficitAforo = sec.cuposEstimados - esp.capacidad;
        if (deficitAforo > 0) {
          if (esp.tipo.includes('LAB') && deficitAforo <= 5) {
            // Tolerancia operacional leve en laboratorio con penalidad blanda
            costoHuecos += deficitAforo * 40;
          } else {
            violacionesDuras.push({
              valido: false,
              codigoRegla: 'H-07',
              mensaje: `Conflicto H-07: El aula ${esp.codigo} (aforo ${esp.capacidad}) no cubre los cupos requeridos (${sec.cuposEstimados}) de la sección ${sec.codigoSeccion}.`,
            });
          }
        }
      }
    } else if (!sec.esProyectoComunitario) {
      // Materia regular debe tener aula física asignada
      violacionesDuras.push({
        valido: false,
        codigoRegla: 'H-08',
        mensaje: `Conflicto H-08: La materia teórica ${sec.nombreMateria} no tiene espacio físico asignado.`,
      });
    }
  }

  // H-09: Anti-teletransportación territorial (mínimo 90 min entre sedes distintas el mismo día)
  // Agrupar por profesor y día
  const bloquesPorDocenteDia = new Map<string, typeof todosLosBloques>();
  for (const b of todosLosBloques) {
    if (!b.profesorId) continue;
    const key = `${b.profesorId}_${b.dia}`;
    const list = bloquesPorDocenteDia.get(key) || [];
    list.push(b);
    bloquesPorDocenteDia.set(key, list);
  }

  for (const [key, bloques] of bloquesPorDocenteDia.entries()) {
    if (bloques.length <= 1) continue;
    // Ordenar cronológicamente por horaInicio
    bloques.sort((a, b) => timeToMinutes(a.horaInicio) - timeToMinutes(b.horaInicio));

    for (let i = 0; i < bloques.length - 1; i++) {
      const actual = bloques[i];
      const siguiente = bloques[i + 1];

      // Si están en sedes distintas
      if (actual.sedeId !== siguiente.sedeId) {
        const finActualMin = timeToMinutes(actual.horaFin);
        const inicioSigMin = timeToMinutes(siguiente.horaInicio);
        const tiempoTraslado = inicioSigMin - finActualMin;

        if (tiempoTraslado < 90) {
          violacionesDuras.push({
            valido: false,
            codigoRegla: 'H-09',
            mensaje: `Conflicto H-09: Traslado insuficiente (${tiempoTraslado} min < 90 min) para docente entre sede ${actual.sedeId} y ${siguiente.sedeId} en ${actual.dia}.`,
          });
        }
      }
    }
  }

  // 2. RESTRICCIONES BLANDAS (SOFT CONSTRAINTS)
  // ----------------------------------------------------
  // S-01: Huecos en la jornada docente
  for (const [key, bloques] of bloquesPorDocenteDia.entries()) {
    if (bloques.length <= 1) continue;
    bloques.sort((a, b) => timeToMinutes(a.horaInicio) - timeToMinutes(b.horaInicio));

    const indicesBloques = bloques
      .map((b) => BLOQUES_HORARIOS_OFICIALES.findIndex((oficial) => oficial.horaInicio === b.horaInicio))
      .filter((idx) => idx !== -1);

    if (indicesBloques.length > 1) {
      const primerBloque = indicesBloques[0];
      const ultimoBloque = indicesBloques[indicesBloques.length - 1];
      const spanTotal = ultimoBloque - primerBloque + 1;
      const huecos = spanTotal - indicesBloques.length;
      if (huecos > 0) {
        costoHuecos += huecos * PESO_HUECO;
      }
    }
  }

  // S-05: Días trabajados por docente (penalizar > 4 días a la semana)
  const diasPorDocente = new Map<string, Set<string>>();
  for (const b of todosLosBloques) {
    if (!b.profesorId) continue;
    const dias = diasPorDocente.get(b.profesorId) || new Set<string>();
    dias.add(b.dia);
    diasPorDocente.set(b.profesorId, dias);
  }

  for (const dias of diasPorDocente.values()) {
    if (dias.size > 4) {
      costoDiasExcesivos += (dias.size - 4) * PESO_DIAS_EXCESIVOS;
    }
  }

  // S-Dist: No concentrar todos los bloques de la misma sección en un solo día si requiere >= 2
  const diasPorSeccion = new Map<string, Set<string>>();
  for (const p of propuestas) {
    const sec = mapaSecciones.get(p.seccionId);
    if (sec && sec.bloquesRequeridos >= 2) {
      const dias = diasPorSeccion.get(p.seccionId) || new Set<string>();
      dias.add(p.dia);
      diasPorSeccion.set(p.seccionId, dias);
    }
  }

  for (const [seccionId, dias] of diasPorSeccion.entries()) {
    const sec = mapaSecciones.get(seccionId);
    if (sec && sec.bloquesRequeridos >= 2 && dias.size === 1) {
      costoMismoDiaConcentrado += PESO_MISMO_DIA_CONCENTRADO;
    }
  }

  const penalidadDura = violacionesDuras.length * PESO_DURA;
  const fitness = penalidadDura + costoHuecos + costoPreferencias + costoDiasExcesivos + costoMismoDiaConcentrado;

  return {
    fitness,
    violacionesDuras,
    costoBlando: {
      huecosDocentes: costoHuecos,
      preferenciasBajas: costoPreferencias,
      diasExcesivos: costoDiasExcesivos,
      concentracionMismaSeccion: costoMismoDiaConcentrado,
    },
    esFactible: violacionesDuras.length === 0,
  };
}
