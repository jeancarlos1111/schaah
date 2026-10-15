import { Request, Response } from 'express';
import prisma from '../../../core/database/prisma';
import { esBaseSqlite, etiquetaRespaldoOferta, respaldarBaseDatos } from '../../../core/database/respaldo';
import { EstatusGrupo, Turno } from '../../../core/domain/enums';
import { FormatoOfertaInvalidoError } from '../ofertaExcel';
import {
  COLUMNAS_INCONSISTENCIA,
  INFO_INCONSISTENCIA,
  TIPOS_INCONSISTENCIA,
  TipoInconsistencia,
  esTipoInconsistencia,
  paginarInconsistencias,
} from '../ofertaInconsistencias';
import { OfertaImportService } from '../services/OfertaImportService';
import { OfertaExportService } from '../services/OfertaExportService';
import { CodigoUnidadInvalidoError, OfertaInconsistenciasService } from '../services/OfertaInconsistenciasService';
import { descartarVistaPrevia, guardarVistaPrevia, obtenerVistaPrevia } from '../services/ofertaPreviewStore';
import { UnidadFueraDeAlcanceError } from '../services/OfertaInconsistenciasService';
import { filtroPfg, filtroPfgEfectivo } from '../../../core/domain/rules/alcancePfgRules';
import { alcanceDe, denegarPfg } from '../../auth/middlewares/alcancePfg';

const importService = new OfertaImportService();
const exportService = new OfertaExportService();
const inconsistenciasService = new OfertaInconsistenciasService();

const MAX_AVISOS_VISTA_PREVIA = 300;

/** Programas a los que se limita la oferta para el usuario (Spec 06); `undefined` = todos. */
function pfgIdsOferta(req: Request): string[] | undefined {
  return filtroPfg(alcanceDe(req))?.in;
}

function urlOferta(periodoId: string, params: { msg?: string; error?: string } = {}): string {
  const query = Object.entries(params)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`)
    .join('&');
  return `/periodos/${periodoId}/oferta${query ? `?${query}` : ''}`;
}

export class OfertaController {
  /**
   * Panel de la oferta de carga horaria del período: métricas, importación/exportación
   * y listado server-side de grupos (cohortes) según Spec 07.
   */
  static async index(req: Request, res: Response) {
    const { id: periodoId } = req.params;
    try {
      const periodo = await prisma.periodoAcademico.findUnique({ where: { id: periodoId } });
      if (!periodo) {
        return res.redirect('/periodos?error=' + encodeURIComponent('Período académico no encontrado.'));
      }

      const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 10));
      const skip = (page - 1) * limit;

      const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
      const pfgId = typeof req.query.pfgId === 'string' ? req.query.pfgId.trim() : '';
      const sedeId = typeof req.query.sedeId === 'string' ? req.query.sedeId.trim() : '';
      const turno = typeof req.query.turno === 'string' ? req.query.turno.trim() : '';
      const estatus = typeof req.query.estatus === 'string' ? req.query.estatus.trim() : '';
      const sortBy = typeof req.query.sortBy === 'string' ? req.query.sortBy.trim() : 'codigoNormalizado';
      const sortDir = req.query.sortDir === 'desc' ? 'desc' : 'asc';

      const columnasOrden = ['codigoNormalizado', 'trayecto', 'turno', 'estatus', 'cantidadEstudiantes'];
      const activeSortBy = columnasOrden.includes(sortBy) ? sortBy : 'codigoNormalizado';

      const alcance = alcanceDe(req);
      const pfgAlcance = filtroPfg(alcance);
      const pfgFiltro = filtroPfgEfectivo(alcance, pfgId);
      const whereGrupos: any = { periodoId, ...(pfgAlcance ? { pfgId: pfgAlcance } : {}) };
      const whereSecciones: any = { periodoId, ...(pfgAlcance ? { unidadCurricular: { pfgId: pfgAlcance } } : {}) };

      const where: any = { periodoId };
      if (pfgFiltro) where.pfgId = pfgFiltro;
      if (sedeId) where.sedeId = sedeId;
      if (turno) where.turno = turno;
      if (estatus) where.estatus = estatus;
      if (q) {
        where.OR = [
          { codigo: { contains: q } },
          { codigoNormalizado: { contains: q.toUpperCase() } },
          { pfg: { nombre: { contains: q } } },
          { pfg: { codigo: { contains: q.toUpperCase() } } },
        ];
      }

      const [
        totalFiltrados,
        grupos,
        totalGrupos,
        totalAsignaciones,
        asignacionesSinDocente,
        docentesConCarga,
        estudiantesAgg,
        pfgs,
        sedes,
      ] = await Promise.all([
        prisma.grupoSeccion.count({ where }),
        prisma.grupoSeccion.findMany({
          where,
          include: {
            pfg: { select: { codigo: true, nombre: true, tipo: true } },
            sede: { select: { codigo: true, nombre: true } },
            _count: { select: { secciones: true } },
          },
          orderBy: [{ [activeSortBy]: sortDir }, { codigoNormalizado: 'asc' }],
          skip,
          take: limit,
        }),
        prisma.grupoSeccion.count({ where: whereGrupos }),
        prisma.seccion.count({ where: whereSecciones }),
        prisma.seccion.count({ where: { ...whereSecciones, profesorId: null } }),
        prisma.seccion.groupBy({ by: ['profesorId'], where: { ...whereSecciones, profesorId: { not: null } } }),
        prisma.grupoSeccion.aggregate({ where: whereGrupos, _sum: { cantidadEstudiantes: true } }),
        prisma.programaFormacion.findMany({ where: { activo: true, id: pfgAlcance }, orderBy: { codigo: 'asc' } }),
        prisma.sede.findMany({ where: { activa: true }, orderBy: { nombre: 'asc' } }),
      ]);

      const vacantesPorGrupo = new Map<string, number>();
      if (grupos.length > 0) {
        const vacantes = await prisma.seccion.groupBy({
          by: ['grupoId'],
          where: { grupoId: { in: grupos.map((g) => g.id) }, profesorId: null },
          _count: { _all: true },
        });
        vacantes.forEach((v) => vacantesPorGrupo.set(v.grupoId!, v._count._all));
      }

      const totalPages = Math.ceil(totalFiltrados / limit) || 1;
      const previa = obtenerVistaPrevia(req.session.ofertaPreviewToken, req.session.usuario!.id, periodoId);

      res.render('pages/oferta/index', {
        title: `Oferta de Carga Horaria - ${periodo.codigo}`,
        periodo,
        grupos: grupos.map((g) => ({ ...g, vacantes: vacantesPorGrupo.get(g.id) ?? 0 })),
        pfgs,
        sedes,
        turnos: Object.values(Turno),
        estatusGrupo: Object.values(EstatusGrupo),
        hayVistaPrevia: !!previa,
        stats: {
          totalGrupos,
          totalAsignaciones,
          asignacionesSinDocente,
          docentesConCarga: docentesConCarga.length,
          totalEstudiantes: estudiantesAgg._sum.cantidadEstudiantes || 0,
        },
        pagination: {
          page,
          limit,
          total: totalFiltrados,
          totalPages,
          start: totalFiltrados === 0 ? 0 : skip + 1,
          end: Math.min(skip + limit, totalFiltrados),
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
        filters: { q, pfgId: typeof pfgFiltro === 'string' ? pfgFiltro : '', sedeId, turno, estatus, sortBy: activeSortBy, sortDir },
        mensaje: req.query.msg || null,
        error: req.query.error || null,
      });
    } catch (err) {
      console.error('[OFERTA-INDEX-ERROR]', err);
      res.redirect(`/periodos/${periodoId}/secciones?error=` + encodeURIComponent('Error al cargar la oferta de carga horaria.'));
    }
  }

  /** Recibe el .xlsx, lo analiza sin escribir en la base de datos y deja la vista previa en sesión. */
  static async importar(req: Request, res: Response) {
    const { id: periodoId } = req.params;
    try {
      const archivo = req.file;
      if (!archivo) {
        return res.redirect(urlOferta(periodoId, { error: 'Seleccione el archivo .xlsx de la oferta de carga horaria.' }));
      }
      const periodo = await prisma.periodoAcademico.findUnique({ where: { id: periodoId } });
      if (!periodo) {
        return res.redirect('/periodos?error=' + encodeURIComponent('Período académico no encontrado.'));
      }

      const analisis = await importService.analizarArchivo(archivo.buffer, periodoId);
      descartarVistaPrevia(req.session.ofertaPreviewToken);
      req.session.ofertaPreviewToken = guardarVistaPrevia({
        ...analisis,
        periodoId,
        usuarioId: req.session.usuario!.id,
        nombreArchivo: archivo.originalname,
      });

      return res.redirect(`/periodos/${periodoId}/oferta/vista-previa`);
    } catch (err: any) {
      console.error('[OFERTA-IMPORTAR-ERROR]', err);
      const mensaje =
        err instanceof FormatoOfertaInvalidoError ? err.message : 'No se pudo analizar el archivo de la oferta.';
      return res.redirect(urlOferta(periodoId, { error: mensaje }));
    }
  }

  static async vistaPrevia(req: Request, res: Response) {
    const { id: periodoId } = req.params;
    const previa = obtenerVistaPrevia(req.session.ofertaPreviewToken, req.session.usuario!.id, periodoId);
    if (!previa) {
      return res.redirect(urlOferta(periodoId, { error: 'La vista previa expiró o no existe. Cargue el archivo nuevamente.' }));
    }
    const periodo = await prisma.periodoAcademico.findUnique({ where: { id: periodoId } });
    const { plan } = previa;

    res.render('pages/oferta/preview', {
      title: `Vista previa de la oferta - ${periodo?.codigo ?? ''}`,
      periodo,
      previa,
      plan,
      avisosVisibles: plan.avisos.slice(0, MAX_AVISOS_VISTA_PREVIA),
      avisosOcultos: Math.max(0, plan.avisos.length - MAX_AVISOS_VISTA_PREVIA),
      programasNuevos: plan.programas.filter((p) => p.nuevo),
      unidadesNuevas: plan.unidades.filter((u) => u.nuevo).length,
      unidadesCodigoGenerado: plan.unidades.filter((u) => u.codigoGenerado).length,
    });
  }

  static async confirmar(req: Request, res: Response) {
    const { id: periodoId } = req.params;
    const token = req.session.ofertaPreviewToken;
    const previa = obtenerVistaPrevia(token, req.session.usuario!.id, periodoId);
    if (!previa) {
      return res.redirect(urlOferta(periodoId, { error: 'La vista previa expiró o no existe. Cargue el archivo nuevamente.' }));
    }
    let respaldo: string | null = null;
    if (esBaseSqlite()) {
      try {
        respaldo = await respaldarBaseDatos(prisma, { etiqueta: etiquetaRespaldoOferta(previa.nombreArchivo) });
      } catch (err: any) {
        console.error('[OFERTA-RESPALDO-ERROR]', err);
        return res.redirect(
          urlOferta(periodoId, {
            error: 'No se pudo respaldar la base de datos antes de importar; no se modificó ningún dato. ' + (err.message || ''),
          })
        );
      }
    }
    try {
      const usuario = req.session.usuario!;
      const r = await importService.aplicarPlan(previa.plan, periodoId, {
        nombreArchivo: previa.nombreArchivo,
        usuarioNombre: `${usuario.nombres} ${usuario.apellidos}`.trim(),
      });
      descartarVistaPrevia(token);
      req.session.ofertaPreviewToken = undefined;
      const msg =
        `Oferta importada: ${r.gruposCreados} grupos nuevos (${r.gruposActualizados} actualizados), ` +
        `${r.seccionesCreadas} asignaciones nuevas (${r.seccionesActualizadas} actualizadas), ` +
        `${r.docentesCreados} docentes nuevos (${r.docentesActualizados} actualizados), ` +
        `${r.unidadesCreadas} unidades curriculares y ${r.programasCreados} programas nuevos.` +
        (respaldo ? ` Respaldo previo: ${respaldo.split(/[\\/]/).pop()}.` : '');
      return res.redirect(`/periodos/${periodoId}/oferta/inconsistencias?msg=${encodeURIComponent(msg)}`);
    } catch (err: any) {
      console.error('[OFERTA-CONFIRMAR-ERROR]', err);
      return res.redirect(urlOferta(periodoId, { error: `La importación se revirtió por completo: ${err.message || 'error desconocido'}` }));
    }
  }

  static async cancelar(req: Request, res: Response) {
    const { id: periodoId } = req.params;
    descartarVistaPrevia(req.session.ofertaPreviewToken);
    req.session.ofertaPreviewToken = undefined;
    return res.redirect(urlOferta(periodoId, { msg: 'Importación descartada; no se modificó ningún dato.' }));
  }

  /** Reporte de lo que la coordinación debe corregir en la oferta, con una tabla server-side por tipo (Spec 07). */
  static async inconsistencias(req: Request, res: Response) {
    const { id: periodoId } = req.params;
    try {
      const periodo = await prisma.periodoAcademico.findUnique({ where: { id: periodoId } });
      if (!periodo) {
        return res.redirect('/periodos?error=' + encodeURIComponent('Período académico no encontrado.'));
      }
      const reporte = await inconsistenciasService.generarReporte(periodoId, { pfgIds: pfgIdsOferta(req) });

      const tipoParam = req.query.tipo;
      const tipo: TipoInconsistencia = esTipoInconsistencia(tipoParam)
        ? tipoParam
        : TIPOS_INCONSISTENCIA.find((t) => reporte.totales[t] > 0) ?? 'sobrecargas';
      const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
      const sortBy = typeof req.query.sortBy === 'string' ? req.query.sortBy : '';
      const sortDir = req.query.sortDir === 'desc' ? 'desc' : 'asc';
      const tabla = paginarInconsistencias(reporte.filas[tipo], tipo, {
        q,
        sortBy,
        sortDir,
        page: parseInt(req.query.page as string, 10) || 1,
        limit: parseInt(req.query.limit as string, 10) || 10,
      });

      const rol = req.session.usuario!.rol;
      res.render('pages/oferta/inconsistencias', {
        title: `Inconsistencias de la oferta - ${periodo.codigo}`,
        periodo,
        tipos: TIPOS_INCONSISTENCIA,
        info: INFO_INCONSISTENCIA,
        totales: reporte.totales,
        ultimaImportacion: reporte.ultimaImportacion,
        tipo,
        columnas: COLUMNAS_INCONSISTENCIA[tipo],
        filas: tabla.filas,
        pagination: tabla.pagination,
        filters: { q, sortBy: tabla.sortBy ?? '', sortDir, limit: tabla.pagination.limit },
        puedeEditarCodigos: ['ADMINISTRADOR', 'DIRECTOR_ACADEMICO', 'COORDINADOR_PFG'].includes(rol),
        mensaje: req.query.msg || null,
        error: req.query.error || null,
      });
    } catch (err) {
      console.error('[OFERTA-INCONSISTENCIAS-ERROR]', err);
      res.redirect(urlOferta(periodoId, { error: 'Error al generar el reporte de inconsistencias.' }));
    }
  }

  static async exportarInconsistencias(req: Request, res: Response) {
    const { id: periodoId } = req.params;
    try {
      const usuario = req.session.usuario!;
      const { nombreArchivo, contenido } = await inconsistenciasService.exportar(
        periodoId,
        `${usuario.nombres} ${usuario.apellidos}`.trim(),
        { pfgIds: pfgIdsOferta(req) }
      );
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
      return res.send(contenido);
    } catch (err: any) {
      console.error('[OFERTA-INCONSISTENCIAS-EXPORTAR-ERROR]', err);
      return res.redirect(
        `/periodos/${periodoId}/oferta/inconsistencias?error=` + encodeURIComponent(err.message || 'No se pudo generar el archivo.')
      );
    }
  }

  static async confirmarCodigoUnidad(req: Request, res: Response) {
    const { id: periodoId, unidadId } = req.params;
    const volver = (clave: 'msg' | 'error', texto: string) =>
      res.redirect(
        `/periodos/${periodoId}/oferta/inconsistencias?tipo=codigos-provisionales&${clave}=${encodeURIComponent(texto)}`
      );
    try {
      const { anterior, nuevo } = await inconsistenciasService.confirmarCodigoUnidad(unidadId, req.body.codigo, {
        pfgIds: pfgIdsOferta(req),
      });
      return volver(
        'msg',
        anterior === nuevo ? `Código ${nuevo} confirmado como oficial.` : `Código actualizado: ${anterior} → ${nuevo}.`
      );
    } catch (err: any) {
      if (err instanceof UnidadFueraDeAlcanceError) return denegarPfg(req, res, err.message);
      if (err instanceof CodigoUnidadInvalidoError) return volver('error', err.message);
      console.error('[OFERTA-CODIGO-UC-ERROR]', err);
      return volver('error', 'No se pudo actualizar el código de la unidad curricular.');
    }
  }

  static async exportar(req: Request, res: Response) {
    const { id: periodoId } = req.params;
    try {
      const usuario = req.session.usuario!;
      const { nombreArchivo, contenido } = await exportService.exportar(
        periodoId,
        `${usuario.nombres} ${usuario.apellidos}`,
        pfgIdsOferta(req)
      );
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
      return res.send(contenido);
    } catch (err: any) {
      console.error('[OFERTA-EXPORTAR-ERROR]', err);
      return res.redirect(urlOferta(periodoId, { error: err.message || 'No se pudo generar el archivo de la oferta.' }));
    }
  }
}
