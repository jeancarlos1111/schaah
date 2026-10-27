import { Request, Response } from 'express';
import { AuditService } from '../../../core/audit/auditService';

export class AuditoriaController {
  async index(req: Request, res: Response) {
    try {
      const page = parseInt(req.query.page as string, 10) || 1;
      const limit = parseInt(req.query.limit as string, 10) || 15;
      const entidad = typeof req.query.entidad === 'string' ? req.query.entidad : '';
      const accion = typeof req.query.accion === 'string' ? req.query.accion : '';
      const q = typeof req.query.q === 'string' ? req.query.q : '';
      const fechaDesde = typeof req.query.fechaDesde === 'string' ? req.query.fechaDesde : '';
      const fechaHasta = typeof req.query.fechaHasta === 'string' ? req.query.fechaHasta : '';

      const resultado = await AuditService.listar({
        page,
        limit,
        entidad,
        accion,
        q,
        fechaDesde,
        fechaHasta,
      });

      res.render('pages/auditoria/index', {
        title: 'Bitácora de Auditoría e Historial',
        items: resultado.items,
        pagination: {
          total: resultado.total,
          page: resultado.page,
          limit: resultado.limit,
          totalPages: resultado.totalPages,
          hasNext: resultado.hasNext,
          hasPrev: resultado.hasPrev,
        },
        filtros: {
          entidad,
          accion,
          q,
          fechaDesde,
          fechaHasta,
        },
        error: req.query.error || null,
        success: req.query.success || null,
      });
    } catch (error) {
      console.error('[AUDITORIA] Error cargando bitácora:', error);
      res.status(500).render('pages/error', {
        title: 'Error de Servidor',
        statusCode: 500,
        mensaje: 'No se pudo cargar la bitácora de auditoría.',
      });
    }
  }
}

export const auditoriaController = new AuditoriaController();
