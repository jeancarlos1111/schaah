import { Request, Response } from 'express';
import { puedeProgramarHorarios } from '../../core/domain/rules/alcancePfgRules';
import { RESTRICCIONES_BLANDAS, RESTRICCIONES_DURAS } from '../../core/domain/rules/catalogoNormativa';
import { LIMITES_DEDICACION } from '../../core/domain/rules/dedicacionRules';
import { BLOQUES_HORARIOS_OFICIALES } from '../../core/domain/rules/timeSlotUtils';
import { DedicacionDocente } from '../../core/domain/enums';
import { buscarPeriodoVigente } from '../periodos/periodoVigente';

export interface ReporteDisponible {
  titulo: string;
  descripcion: string;
  href: string;
  icono: string;
  accion: string;
}

const ETIQUETAS_DEDICACION: Record<string, string> = {
  [DedicacionDocente.DEDICACION_EXCLUSIVA]: 'Dedicación Exclusiva (DE)',
  [DedicacionDocente.TIEMPO_COMPLETO]: 'Tiempo Completo (TC)',
  [DedicacionDocente.MEDIO_TIEMPO]: 'Medio Tiempo (MT)',
  [DedicacionDocente.TIEMPO_CONVENCIONAL]: 'Tiempo Convencional (TV)',
};

/**
 * Reportes y exportaciones que el rol puede abrir sin recibir un 403: la planificación ve las
 * planillas del período; el docente, su horario, su disponibilidad y la oferta en lectura.
 */
export function reportesDisponibles(rol: string | null | undefined, periodoId: string | null): ReporteDisponible[] {
  const reportes: ReporteDisponible[] = [];
  if (puedeProgramarHorarios(rol)) {
    reportes.push({
      titulo: 'Planilla consolidada de carga docente',
      descripcion: 'Docencia directa, proyecto, permanencia y estado normativo (H-04 y H-05) de cada docente.',
      href: '/docentes/carga-consolidada',
      icono: 'file-text',
      accion: 'Abrir planilla',
    });
  } else {
    reportes.push(
      {
        titulo: 'Mi horario',
        descripcion: 'Horario semanal de sus clases, con descarga en PDF.',
        href: '/horarios',
        icono: 'calendar',
        accion: 'Ver horario',
      },
      {
        titulo: 'Mi disponibilidad',
        descripcion: 'Franjas que declaró disponibles para el período en planificación.',
        href: '/mi-disponibilidad',
        icono: 'clock',
        accion: 'Declarar disponibilidad',
      }
    );
  }
  if (!periodoId) return reportes;

  reportes.push({
    titulo: 'Oferta de carga horaria (.xlsx)',
    descripcion: 'Consolidado institucional del período con sus 29 columnas.',
    href: `/periodos/${periodoId}/oferta/exportar.xlsx`,
    icono: 'download',
    accion: 'Descargar',
  });
  if (puedeProgramarHorarios(rol)) {
    reportes.push(
      {
        titulo: 'Inconsistencias de la oferta (.xlsx)',
        descripcion: 'Sobrecargas, déficits, vacantes, códigos provisionales y dedicaciones contradictorias.',
        href: `/periodos/${periodoId}/oferta/inconsistencias.xlsx`,
        icono: 'download',
        accion: 'Descargar',
      },
      {
        titulo: 'Horarios oficiales en PDF',
        descripcion: 'Desde la matriz, elija docente, aula o cohorte y pulse Descargar Horario PDF.',
        href: `/periodos/${periodoId}/horarios`,
        icono: 'table',
        accion: 'Abrir matriz',
      }
    );
  }
  return reportes;
}

export async function normativa(req: Request, res: Response) {
  const periodo = await buscarPeriodoVigente();
  const dedicaciones = Object.entries(LIMITES_DEDICACION).map(([clave, l]) => ({
    nombre: ETIQUETAS_DEDICACION[clave] ?? clave,
    docencia: `${l.minDocencia} h – ${l.maxDocencia} h`,
    permanencia: `${l.minPermanencia} h – ${l.maxPermanencia} h`,
    proyecto: `${l.minProyectoComunidad} h – ${l.maxProyectoComunidad} h`,
    investigacion: `${l.minInvestigacionGestion} h – ${l.maxInvestigacionGestion} h`,
  }));
  res.render('pages/normativa/index', {
    title: 'Normativa y Reportes',
    periodo,
    restriccionesDuras: RESTRICCIONES_DURAS,
    restriccionesBlandas: RESTRICCIONES_BLANDAS,
    dedicaciones,
    bloques: BLOQUES_HORARIOS_OFICIALES,
    reportes: reportesDisponibles(req.session?.usuario?.rol, periodo?.id ?? null),
  });
}
