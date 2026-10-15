import { Request, Response } from 'express';
import prisma from '../../core/database/prisma';
import { RolUsuario } from '../../core/domain/enums';
import { filtroPfg } from '../../core/domain/rules/alcancePfgRules';
import { alcanceDe } from '../auth/middlewares/alcancePfg';
import { OfertaInconsistenciasService } from '../oferta/services/OfertaInconsistenciasService';
import { buscarPeriodoVigente } from '../periodos/periodoVigente';

export interface MetricasTablero {
  docentesTotales: number;
  docentesExclusivos: number;
  seccionesTotales: number;
  seccionesAsignadas: number;
  porcentajeAsignado: number;
  espaciosTotales: number;
  sedesActivas: number;
  sobrecargas: number;
  deficits: number;
  alertasSobrecarga: number;
}

const METRICAS_VACIAS: MetricasTablero = {
  docentesTotales: 0,
  docentesExclusivos: 0,
  seccionesTotales: 0,
  seccionesAsignadas: 0,
  porcentajeAsignado: 0,
  espaciosTotales: 0,
  sedesActivas: 0,
  sobrecargas: 0,
  deficits: 0,
  alertasSobrecarga: 0,
};

/**
 * Tablero de control: cifras del período vigente. El coordinador ve las asignaciones y las
 * desviaciones de carga (H-04 y H-05) de sus programas (Spec 06).
 */
export async function tablero(req: Request, res: Response) {
  const esDocente = req.session?.usuario?.rol === RolUsuario.DOCENTE;
  try {
    const periodo = await buscarPeriodoVigente();
    if (!periodo) {
      return res.render('pages/dashboard', {
        title: 'Tablero de Control',
        periodo: null,
        esDocente,
        metricas: METRICAS_VACIAS,
      });
    }

    const alcance = alcanceDe(req);
    const pfgAlcance = filtroPfg(alcance);
    const whereSecciones = {
      periodoId: periodo.id,
      ...(pfgAlcance ? { unidadCurricular: { pfgId: pfgAlcance } } : {}),
    };
    const [
      docentesTotales,
      docentesExclusivos,
      seccionesTotales,
      seccionesAsignadas,
      espaciosTotales,
      sedesActivas,
      reporte,
    ] = await Promise.all([
      prisma.profesor.count({ where: { activo: true } }),
      prisma.profesorDedicacion.count({ where: { periodoId: periodo.id, dedicacion: 'DEDICACION_EXCLUSIVA' } }),
      prisma.seccion.count({ where: whereSecciones }),
      prisma.seccion.count({ where: { ...whereSecciones, profesorId: { not: null } } }),
      prisma.espacioFisico.count({ where: { activo: true } }),
      prisma.sede.count({ where: { activa: true } }),
      new OfertaInconsistenciasService().generarReporte(periodo.id, alcance.total ? {} : { pfgIds: alcance.pfgIds }),
    ]);

    const porcentajeAsignado =
      seccionesTotales > 0 ? Math.round((seccionesAsignadas / seccionesTotales) * 1000) / 10 : 0;
    const sobrecargas = reporte.totales.sobrecargas;
    const deficits = reporte.totales.deficit;

    return res.render('pages/dashboard', {
      title: 'Tablero de Control',
      periodo,
      esDocente,
      metricas: {
        docentesTotales,
        docentesExclusivos,
        seccionesTotales,
        seccionesAsignadas,
        porcentajeAsignado,
        espaciosTotales,
        sedesActivas,
        sobrecargas,
        deficits,
        alertasSobrecarga: sobrecargas + deficits,
      },
    });
  } catch (err) {
    console.error('[DASHBOARD-ERROR]', err);
    return res.render('pages/dashboard', {
      title: 'Tablero de Control',
      periodo: null,
      esDocente,
      metricas: METRICAS_VACIAS,
    });
  }
}
