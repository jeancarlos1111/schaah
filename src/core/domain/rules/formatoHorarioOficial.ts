import { Turno } from '../enums';
import {
  BLOQUES_HORARIOS_OFICIALES,
  DIAS_FORMATO_OFICIAL,
  HORAS_ACADEMICAS_40MIN,
  HoraAcademica40Min,
} from './timeSlotUtils';

export interface BloqueHorarioParaFormato {
  dia: string;
  horaInicio: string;
  horaFin?: string;
  unidadNombre: string;
  profesorNombre: string;
  espacioNombre: string;
  codigoSeccion?: string;
  pfgNombre?: string;
  esProyectoComunitario?: boolean;
  tipoBloque?: string;
}

export interface CeldaFormatoOficial {
  rowSpan: number;
  ocultaPorFusion: boolean;
  ocupada: boolean;
  aulaEtiqueta: string;
  materiaNombre: string;
  profesorNombre: string;
  codigoSeccion: string;
}

export interface FilaFormatoOficial {
  hora: HoraAcademica40Min;
  celdasPorDia: Record<string, CeldaFormatoOficial>;
}

export interface EncabezadoFormatoOficial {
  universidad: string;
  lema: string;
  ejeGeopolitico: string;
  ejeMunicipal: string;
  periodoEtiqueta: string;
  tituloIzquierdo: string; // ej. "P.F.G. INFORMÁTICA PARA LA GESTIÓN SOCIAL"
  codigoDerecho: string;   // ej. "KV BO-RC 01 A-M"
  citaPie: string;
  autorCita: string;
}

export const LEMA_UBV_OFICIAL = '"PROFESIONALES LIDERES DEL SOCIALISMO"';
export const EJE_GEOPOLITICO_OFICIAL = 'EJE GEOPOLÍTICO REGIONAL SALTO KEREPAKUPAIVENA';
export const EJE_MUNICIPAL_DEFAULT = 'EJE MUNICIPAL RIO CAURA';
export const CITA_FREIRE_LINEA_1 =
  '"El educador democrático no puede negarse el deber de reforzar, en su práctica docente,';
export const CITA_FREIRE_LINEA_2 =
  'la capacidad crítica del educando, su curiosidad, su insumisión." Paulo Freire';
export const CITA_FREIRE_OFICIAL = `${CITA_FREIRE_LINEA_1} ${CITA_FREIRE_LINEA_2}`;
export const AUTOR_CITA_OFICIAL = 'Paulo Freire';

/**
 * Formatea el código del período académico al estilo del reporte oficial UBV (ej. "2026-II" -> "2026-2").
 */
export function formatearPeriodoOficial(codigoPeriodo: string): string {
  const limpio = (codigoPeriodo || '').trim().toUpperCase();
  const reemplazado = limpio
    .replace(/-III$/, '-3')
    .replace(/-II$/, '-2')
    .replace(/-I$/, '-1');
  return `PERIODO ACADÉMICO ${reemplazado}`;
}

/**
 * Formatea la etiqueta superior derecha de la celda (aula o comunidad/institución).
 */
export function formatearEtiquetaEspacioOficial(bloque: BloqueHorarioParaFormato): string {
  const esp = (bloque.espacioNombre || '').trim();
  const esProyecto =
    bloque.esProyectoComunitario ||
    bloque.tipoBloque === 'PROYECTO_COMUNITARIO' ||
    /proyecto|trabajo especial de grado|pasant/i.test(bloque.unidadNombre || '');

  if (esProyecto) {
    if (esp && !/sin aula|campo/i.test(esp)) {
      return `${esp},U.B.V.\nComunidad\nInstitución`;
    }
    return 'U.B.V. /Comunidad\nInstitución';
  }

  if (!esp || /sin aula|campo/i.test(esp)) {
    return 'U.B.V. /Comunidad\nInstitución';
  }

  return esp;
}

/**
 * Construye la matriz de 6 filas de 40 minutos × 7 días (Lunes a Domingo)
 * fusionando verticalmente (`rowSpan`) los bloques de la misma unidad curricular en el mismo día.
 */
export function construirGrillaFormatoOficial(
  bloques: BloqueHorarioParaFormato[],
  turno: Turno = Turno.MATUTINO
): FilaFormatoOficial[] {
  const horasTurno = HORAS_ACADEMICAS_40MIN.filter((h) => h.turno === turno);
  const dias = [...DIAS_FORMATO_OFICIAL];

  // Mapa auxiliar: [dia][indiceFilaHora] -> BloqueHorarioParaFormato
  const ocupacionPorHora: Record<string, (BloqueHorarioParaFormato | null)[]> = {};
  for (const d of dias) {
    ocupacionPorHora[d] = new Array(horasTurno.length).fill(null);
  }

  for (const b of bloques) {
    const diaUpper = (b.dia || '').trim().toUpperCase();
    if (!ocupacionPorHora[diaUpper]) continue;

    // Identificar a qué bloque oficial (1..8) o a qué hora de 40 min corresponde
    const bloqueOficial = BLOQUES_HORARIOS_OFICIALES.find((bo) => bo.horaInicio === b.horaInicio);
    if (bloqueOficial) {
      horasTurno.forEach((h, idx) => {
        if (h.bloqueOficialNumero === bloqueOficial.numero) {
          ocupacionPorHora[diaUpper][idx] = b;
        }
      });
    } else {
      // Coincidencia directa por hora de 40 min
      horasTurno.forEach((h, idx) => {
        if (h.horaInicio === b.horaInicio) {
          ocupacionPorHora[diaUpper][idx] = b;
        }
      });
    }
  }

  // Inicializar estructura de filas
  const filas: FilaFormatoOficial[] = horasTurno.map((hora) => {
    const celdasPorDia: Record<string, CeldaFormatoOficial> = {};
    for (const d of dias) {
      celdasPorDia[d] = {
        rowSpan: 1,
        ocultaPorFusion: false,
        ocupada: false,
        aulaEtiqueta: '',
        materiaNombre: '',
        profesorNombre: '',
        codigoSeccion: '',
      };
    }
    return { hora, celdasPorDia };
  });

  // Calcular fusiones verticales (rowSpan) por día para bloques contiguos de la misma materia/profesor
  for (const d of dias) {
    let i = 0;
    while (i < horasTurno.length) {
      const actual = ocupacionPorHora[d][i];
      if (!actual) {
        i++;
        continue;
      }

      let span = 1;
      while (
        i + span < horasTurno.length &&
        ocupacionPorHora[d][i + span] !== null &&
        mismaAsignacionEnDia(actual, ocupacionPorHora[d][i + span]!)
      ) {
        span++;
      }

      filas[i].celdasPorDia[d] = {
        rowSpan: span,
        ocultaPorFusion: false,
        ocupada: true,
        aulaEtiqueta: formatearEtiquetaEspacioOficial(actual),
        materiaNombre: actual.unidadNombre,
        profesorNombre: actual.profesorNombre,
        codigoSeccion: actual.codigoSeccion || '',
      };

      for (let k = 1; k < span; k++) {
        filas[i + k].celdasPorDia[d] = {
          rowSpan: 0,
          ocultaPorFusion: true,
          ocupada: true,
          aulaEtiqueta: '',
          materiaNombre: actual.unidadNombre,
          profesorNombre: actual.profesorNombre,
          codigoSeccion: actual.codigoSeccion || '',
        };
      }

      i += span;
    }
  }

  return filas;
}

function mismaAsignacionEnDia(a: BloqueHorarioParaFormato, b: BloqueHorarioParaFormato): boolean {
  if (a.codigoSeccion && b.codigoSeccion && a.codigoSeccion === b.codigoSeccion) {
    return true;
  }
  return (
    a.unidadNombre.trim().toUpperCase() === b.unidadNombre.trim().toUpperCase() &&
    a.profesorNombre.trim().toUpperCase() === b.profesorNombre.trim().toUpperCase()
  );
}
