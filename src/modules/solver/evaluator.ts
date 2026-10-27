import {
  BLOQUES_HORARIOS_OFICIALES,
  BloqueHorarioOficial,
  timeToMinutes,
  to12HourFormat,
} from '../../core/domain/rules/timeSlotUtils';
import { EvaluacionRegla, claveCohorte } from '../../core/domain/rules/horarioConflictRules';
import {
  validarH13ReservaMartes,
  validarH14BloqueFijoLiderazgo,
} from '../../core/domain/rules/bloquesInstitucionalesRules';
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

  const mapaSecciones = new Map<string, SeccionSolverData>();
  for (const sec of input.seccionesPendientes) {
    mapaSecciones.set(sec.id, sec);
  }

  const mapaEspacios = new Map<string, EspacioSolverData>();
  for (const esp of input.espacios) {
    mapaEspacios.set(esp.id, esp);
  }
  const nombreDocente = (id: string) => input.docentes.get(id)?.nombreCompleto ?? 'sin nombre registrado';
  const nombreSede = (id: string) => input.nombresSedes?.get(id) ?? id;

  // Unificamos bloques asignados propuestos con los bloques existentes ya fijados
  const todosLosBloques: {
    id: string;
    seccionId: string;
    codigoSeccion: string;
    grupoId: string | null;
    grupoCodigo: string | null;
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
      codigoSeccion: h.codigoSeccion ?? 'ya programada',
      grupoId: h.grupoId || null,
      grupoCodigo: h.grupoCodigo || null,
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
      codigoSeccion: p.codigoSeccion,
      grupoId: mapaSecciones.get(p.seccionId)?.grupoId || null,
      grupoCodigo: mapaSecciones.get(p.seccionId)?.grupoCodigo || null,
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
  const ocupacionDocente = new Map<string, string[]>(); // key: `${profesorId}_${dia}_${horaInicio}` -> [codigoSeccion]
  // H-02: No solapamiento de aula (mismo espacioFisico, mismo día y horaInicio)
  const ocupacionAula = new Map<string, string[]>(); // key: `${espacioFisicoId}_${dia}_${horaInicio}` -> [codigoSeccion]
  // H-03: No solapamiento de cohorte (mismo grupo de estudiantes, mismo día y horaInicio)
  const ocupacionSeccion = new Map<string, string[]>(); // key: `${cohorte}_${dia}_${horaInicio}` -> [codigoSeccion]

  for (const b of todosLosBloques) {
    const momento = `el ${b.dia} a las ${to12HourFormat(b.horaInicio)}`;

    // H-03: Sección / Grupo
    const secKey = `${claveCohorte(b)}_${b.dia}_${b.horaInicio}`;
    const secList = ocupacionSeccion.get(secKey) || [];
    secList.push(b.codigoSeccion);
    ocupacionSeccion.set(secKey, secList);
    if (secList.length > 1) {
      const cohorte = b.grupoCodigo ? `del grupo ${b.grupoCodigo}` : `de la sección ${b.codigoSeccion}`;
      violacionesDuras.push({
        valido: false,
        codigoRegla: 'H-03',
        mensaje: `Conflicto H-03: La cohorte ${cohorte} tiene más de una clase ${momento} (secciones ${secList.join(', ')}).`,
      });
    }

    // H-01: Docente
    if (b.profesorId) {
      const docKey = `${b.profesorId}_${b.dia}_${b.horaInicio}`;
      const docList = ocupacionDocente.get(docKey) || [];
      docList.push(b.codigoSeccion);
      ocupacionDocente.set(docKey, docList);
      if (docList.length > 1) {
        violacionesDuras.push({
          valido: false,
          codigoRegla: 'H-01',
          mensaje: `Conflicto H-01: El docente ${nombreDocente(b.profesorId)} tiene asignaciones solapadas ${momento} (secciones ${docList.join(', ')}).`,
        });
      }
    }

    // H-02: Aula (si tiene espacio asignado y no es virtual/comunitario)
    if (b.espacioFisicoId) {
      const aulaKey = `${b.espacioFisicoId}_${b.dia}_${b.horaInicio}`;
      const aulaList = ocupacionAula.get(aulaKey) || [];
      aulaList.push(b.codigoSeccion);
      ocupacionAula.set(aulaKey, aulaList);
      if (aulaList.length > 1) {
        const espacio = mapaEspacios.get(b.espacioFisicoId)?.codigo ?? 'sin código registrado';
        violacionesDuras.push({
          valido: false,
          codigoRegla: 'H-02',
          mensaje: `Conflicto H-02: El espacio ${espacio} está ocupado por varias secciones ${momento} (secciones ${aulaList.join(', ')}).`,
        });
      }
    }
  }

  // H-06, H-07, H-08 sobre cada propuesta individual
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
            mensaje: `Conflicto H-06: El docente ${doc.nombreCompleto} no tiene disponibilidad para el ${p.dia} a las ${to12HourFormat(p.horaInicio)}.`,
          });
        } else if (disp.prioridadPreferencia === 3) {
          costoPreferencias += PESO_PREFERENCIA;
        }

        // Restricción de 3 días acordados
        if (doc.diasDisponibles && doc.diasDisponibles.length > 0 && !doc.diasDisponibles.includes(p.dia)) {
          violacionesDuras.push({
            valido: false,
            codigoRegla: 'H-DIAS-DISPONIBILIDAD',
            mensaje: `Conflicto de disponibilidad: El docente ${doc.nombreCompleto} no tiene disponibilidad el día ${p.dia} (días acordados: ${doc.diasDisponibles.join(', ')}).`,
          });
        }

        // Restricción de accesibilidad de piso
        if (doc.pisoMaximo !== null && doc.pisoMaximo !== undefined && p.espacioFisicoId) {
          const esp = mapaEspacios.get(p.espacioFisicoId);
          if (esp && (esp.pisoNivel ?? 0) > doc.pisoMaximo) {
            violacionesDuras.push({
              valido: false,
              codigoRegla: 'H-ACCESIBILIDAD-PISO',
              mensaje: `Conflicto de accesibilidad: El docente ${doc.nombreCompleto} tiene restricción médica (máximo piso ${doc.pisoMaximo}) y se le asignó el espacio ${esp.codigo} en piso ${esp.pisoNivel}.`,
            });
          }
        }
      }
    }

    // H-07 y H-08: Aforo y Tipo de Espacio
    if (p.espacioFisicoId && sec.esProyectoComunitario) {
      violacionesDuras.push({
        valido: false,
        codigoRegla: 'H-08',
        mensaje: `Conflicto H-08: La sección ${sec.codigoSeccion} es Proyecto Comunitario (trabajo de campo) y no debe reservar aula física.`,
      });
    } else if (p.espacioFisicoId) {
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

    // H-13: Reserva Institucional Martes
    const evalH13 = validarH13ReservaMartes(p);
    if (!evalH13.valido) {
      violacionesDuras.push(evalH13);
    }

    // H-14: Bloque Fijo Institucional Liderazgo
    const evalH14 = validarH14BloqueFijoLiderazgo({
      dia: p.dia,
      horaInicio: p.horaInicio,
      horaFin: p.horaFin,
      unidadCurricularNombre: sec.nombreMateria,
      diasPermitidosDocente: p.profesorId ? input.docentes.get(p.profesorId)?.diasDisponibles : undefined,
    });
    if (!evalH14.valido) {
      violacionesDuras.push(evalH14);
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
            mensaje: `Conflicto H-09: Traslado insuficiente (${tiempoTraslado} min < 90 min) para el docente ${nombreDocente(actual.profesorId!)} entre las sedes ${nombreSede(actual.sedeId)} y ${nombreSede(siguiente.sedeId)} el ${actual.dia}.`,
          });
        }
      }
    }
  }

  // Integridad de asignación semanal (Spec 03): cada sección pendiente recibe todos sus bloques.
  // Sin esta regla un motor podría omitir secciones sin franja candidata y aun así reportar OPTIMAL.
  const bloquesPorSeccion = new Map<string, number>();
  for (const p of propuestas) {
    bloquesPorSeccion.set(p.seccionId, (bloquesPorSeccion.get(p.seccionId) ?? 0) + 1);
  }
  for (const sec of input.seccionesPendientes) {
    const asignados = bloquesPorSeccion.get(sec.id) ?? 0;
    if (asignados >= sec.bloquesRequeridos) continue;
    const doc = sec.profesorId ? input.docentes.get(sec.profesorId) : undefined;
    const franjasDocente = doc ? doc.disponibilidades.filter((d) => d.disponible).length : null;
    if (doc && franjasDocente === 0) {
      violacionesDuras.push({
        valido: false,
        codigoRegla: 'H-06',
        mensaje: `Sección ${sec.codigoSeccion} sin programar: el docente ${doc.nombreCompleto} no ha declarado disponibilidad horaria en el período.`,
      });
    } else if (doc && franjasDocente !== null && franjasDocente < sec.bloquesRequeridos) {
      violacionesDuras.push({
        valido: false,
        codigoRegla: 'H-06',
        mensaje: `Sección ${sec.codigoSeccion} incompleta: el docente ${doc.nombreCompleto} declaró ${franjasDocente} franjas disponibles y la materia requiere ${sec.bloquesRequeridos} bloques semanales.`,
      });
    } else {
      violacionesDuras.push({
        valido: false,
        codigoRegla: 'INTEGRIDAD',
        mensaje: `Sección ${sec.codigoSeccion} incompleta: recibió ${asignados} de ${sec.bloquesRequeridos} bloques semanales; no hay franja factible para el resto.`,
      });
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
