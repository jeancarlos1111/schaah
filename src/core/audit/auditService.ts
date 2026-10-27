import { prisma } from '../database/prisma';

export interface RegistrarAuditoriaParams {
  usuarioId?: string | null;
  usuarioEmail: string;
  usuarioNombre: string;
  rol: string;
  accion: 'CREAR' | 'EDITAR' | 'ELIMINAR' | 'ACTIVAR' | 'DESACTIVAR' | 'LOGIN' | 'IMPORTAR' | 'SOLVER';
  entidad: 'USUARIO' | 'ROL' | 'ESPACIO' | 'DOCENTE' | 'SECCION' | 'HORARIO' | 'PERIODO' | 'MALLA' | 'OFERTA' | 'DISPONIBILIDAD';
  entidadId?: string | null;
  detalles?: string | null;
  datosAnteriores?: Record<string, unknown> | string | null;
  datosNuevos?: Record<string, unknown> | string | null;
  ip?: string | null;
}

export interface FiltrosAuditoria {
  page?: number;
  limit?: number;
  entidad?: string;
  accion?: string;
  usuarioEmail?: string;
  q?: string;
  fechaDesde?: string;
  fechaHasta?: string;
}

export class AuditService {
  /**
   * Registra un evento en la bitácora global de auditoría.
   */
  static async registrar(params: RegistrarAuditoriaParams) {
    try {
      const datosAntStr = params.datosAnteriores
        ? typeof params.datosAnteriores === 'string'
          ? params.datosAnteriores
          : JSON.stringify(params.datosAnteriores)
        : null;

      const datosNuevStr = params.datosNuevos
        ? typeof params.datosNuevos === 'string'
          ? params.datosNuevos
          : JSON.stringify(params.datosNuevos)
        : null;

      return await prisma.bitacoraAuditoria.create({
        data: {
          usuarioId: params.usuarioId ?? null,
          usuarioEmail: params.usuarioEmail,
          usuarioNombre: params.usuarioNombre,
          rol: params.rol,
          accion: params.accion,
          entidad: params.entidad,
          entidadId: params.entidadId ?? null,
          detalles: params.detalles ?? null,
          datosAnteriores: datosAntStr,
          datosNuevos: datosNuevStr,
          ip: params.ip ?? null,
        },
      });
    } catch (error) {
      // La auditoría nunca debe tumbar una transacción principal, pero se reporta
      console.error('[AUDIT_ERROR] Error al registrar evento de bitácora:', error);
      return null;
    }
  }

  /**
   * Consulta paginada y filtrada para la vista del Administrador.
   */
  static async listar(filtros: FiltrosAuditoria = {}) {
    const page = Math.max(1, filtros.page || 1);
    const limit = Math.max(1, Math.min(100, filtros.limit || 15));
    const skip = (page - 1) * limit;

    const where: any = {};

    if (filtros.entidad && filtros.entidad.trim() !== '') {
      where.entidad = filtros.entidad.trim();
    }

    if (filtros.accion && filtros.accion.trim() !== '') {
      where.accion = filtros.accion.trim();
    }

    if (filtros.usuarioEmail && filtros.usuarioEmail.trim() !== '') {
      where.usuarioEmail = { contains: filtros.usuarioEmail.trim() };
    }

    if (filtros.q && filtros.q.trim() !== '') {
      const busqueda = filtros.q.trim();
      where.OR = [
        { usuarioNombre: { contains: busqueda } },
        { usuarioEmail: { contains: busqueda } },
        { detalles: { contains: busqueda } },
        { entidadId: { contains: busqueda } },
      ];
    }

    if (filtros.fechaDesde || filtros.fechaHasta) {
      where.fecha = {};
      if (filtros.fechaDesde) {
        where.fecha.gte = new Date(`${filtros.fechaDesde}T00:00:00.000Z`);
      }
      if (filtros.fechaHasta) {
        where.fecha.lte = new Date(`${filtros.fechaHasta}T23:59:59.999Z`);
      }
    }

    const [total, items] = await Promise.all([
      prisma.bitacoraAuditoria.count({ where }),
      prisma.bitacoraAuditoria.findMany({
        where,
        skip,
        take: limit,
        orderBy: { fecha: 'desc' },
      }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      items,
      total,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }
}
