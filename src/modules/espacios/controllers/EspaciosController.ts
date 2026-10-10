import { Request, Response } from 'express';
import prisma from '../../../core/database/prisma';
import { TipoEspacio } from '../../../core/domain/enums';

export class EspaciosController {
  async index(req: Request, res: Response) {
    try {
      const activeTab = req.query.tab === 'sedes' ? 'sedes' : 'espacios';

      // Parámetros de consulta Server-Side
      const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 10));
      const skip = (page - 1) * limit;

      const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
      const sedeIdParam = typeof req.query.sedeId === 'string' ? req.query.sedeId.trim() : '';
      const tipoParam = typeof req.query.tipo === 'string' ? req.query.tipo.trim() : '';
      const estadoParam = typeof req.query.estado === 'string' ? req.query.estado.trim() : '';
      const sortBy = typeof req.query.sortBy === 'string' ? req.query.sortBy.trim() : 'codigo';
      const sortDir = req.query.sortDir === 'desc' ? 'desc' : 'asc';

      const validSortColumns = ['codigo', 'nombre', 'tipo', 'capacidad', 'piso', 'activo', 'createdAt'];
      const activeSortBy = validSortColumns.includes(sortBy) ? sortBy : 'codigo';

      // Filtros dinámicos a nivel de base de datos
      const where: any = {};
      if (sedeIdParam) {
        where.sedeId = sedeIdParam;
      }
      if (tipoParam) {
        where.tipo = tipoParam;
      }
      if (estadoParam === 'Activo' || estadoParam === 'true') {
        where.activo = true;
      } else if (estadoParam === 'Inactivo' || estadoParam === 'false') {
        where.activo = false;
      }

      if (q) {
        where.OR = [
          { codigo: { contains: q } },
          { nombre: { contains: q } },
          { piso: { contains: q } },
          { sede: { nombre: { contains: q } } },
        ];
      }

      // Consultas concurrentes en BD: registros paginados, total filtrado, sedes activas y métricas Bento
      const [
        totalFiltrados,
        espacios,
        sedes,
        totalEspaciosGeneral,
        totalLaboratorios,
        totalCapacidadAggr,
        totalSedesGeneral,
        totalAldeas
      ] = await Promise.all([
        prisma.espacioFisico.count({ where }),
        prisma.espacioFisico.findMany({
          where,
          include: { sede: true },
          orderBy: { [activeSortBy]: sortDir },
          skip,
          take: limit,
        }),
        prisma.sede.findMany({
          include: {
            _count: {
              select: { espacios: true },
            },
          },
          orderBy: { nombre: 'asc' },
        }),
        prisma.espacioFisico.count(),
        prisma.espacioFisico.count({
          where: { tipo: { contains: 'LABORATORIO' } },
        }),
        prisma.espacioFisico.aggregate({
          _sum: { capacidad: true },
          where: { activo: true },
        }),
        prisma.sede.count(),
        prisma.sede.count({ where: { esAldeaMunicipalizada: true } }),
      ]);

      const totalPages = Math.ceil(totalFiltrados / limit) || 1;
      const pagination = {
        page,
        limit,
        total: totalFiltrados,
        totalPages,
        start: totalFiltrados === 0 ? 0 : skip + 1,
        end: Math.min(skip + limit, totalFiltrados),
        hasNext: page < totalPages,
        hasPrev: page > 1,
      };

      const filters = {
        q,
        sedeId: sedeIdParam,
        tipo: tipoParam,
        estado: estadoParam,
        sortBy: activeSortBy,
        sortDir,
      };

      const stats = {
        totalEspacios: totalEspaciosGeneral,
        totalCapacidad: totalCapacidadAggr._sum.capacidad || 0,
        totalLaboratorios,
        totalSedes: totalSedesGeneral,
        totalAldeas,
      };

      res.render('pages/espacios/index', {
        title: 'Gestión de Sedes y Espacios Físicos',
        activeTab,
        espacios,
        sedes,
        tiposEspacio: Object.values(TipoEspacio),
        pagination,
        filters,
        stats,
        error: req.query.error || null,
        success: req.query.success || null,
      });
    } catch (error) {
      console.error('[ESPACIOS] Error listando espacios:', error);
      res.status(500).render('pages/error', {
        title: 'Error de Servidor',
        statusCode: 500,
        mensaje: 'No se pudieron recuperar los espacios físicos de la institución.',
      });
    }
  }

  async crearAula(req: Request, res: Response) {
    try {
      const { sedeId, codigo, nombre, tipo, capacidad, piso } = req.body;

      if (!sedeId || !codigo || !nombre || !tipo || !capacidad) {
        return res.redirect('/espacios?error=Todos+los+campos+obligatorios+deben+ser+completados');
      }

      const capacidadNum = parseInt(capacidad, 10);
      if (isNaN(capacidadNum) || capacidadNum <= 0) {
        return res.redirect('/espacios?error=La+capacidad+debe+ser+un+número+entero+positivo');
      }

      const codigoNormalizado = codigo.trim().toUpperCase();

      const existe = await prisma.espacioFisico.findUnique({
        where: {
          sedeId_codigo: {
            sedeId,
            codigo: codigoNormalizado,
          },
        },
      });

      if (existe) {
        return res.redirect('/espacios?error=El+código+del+aula+ya+existe+en+la+sede+seleccionada');
      }

      await prisma.espacioFisico.create({
        data: {
          sedeId,
          codigo: codigoNormalizado,
          nombre: nombre.trim(),
          tipo,
          capacidad: capacidadNum,
          piso: piso ? piso.trim() : null,
          activo: true,
        },
      });

      res.redirect('/espacios?success=Espacio+físico+creado+exitosamente');
    } catch (error) {
      console.error('[ESPACIOS] Error creando aula:', error);
      res.redirect('/espacios?error=Error+al+registrar+el+espacio+físico');
    }
  }

  async editarAula(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { nombre, tipo, capacidad, piso } = req.body;

      const capacidadNum = parseInt(capacidad, 10);
      if (isNaN(capacidadNum) || capacidadNum <= 0) {
        return res.redirect('/espacios?error=La+capacidad+debe+ser+un+número+válido');
      }

      await prisma.espacioFisico.update({
        where: { id },
        data: {
          nombre: nombre.trim(),
          tipo,
          capacidad: capacidadNum,
          piso: piso ? piso.trim() : null,
        },
      });

      res.redirect('/espacios?success=Espacio+físico+actualizado+correctamente');
    } catch (error) {
      console.error('[ESPACIOS] Error editando aula:', error);
      res.redirect('/espacios?error=No+se+pudo+actualizar+el+espacio+físico');
    }
  }

  async toggleAula(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const aula = await prisma.espacioFisico.findUnique({ where: { id } });

      if (!aula) {
        return res.redirect('/espacios?error=Espacio+no+encontrado');
      }

      await prisma.espacioFisico.update({
        where: { id },
        data: { activo: !aula.activo },
      });

      const estadoTexto = !aula.activo ? 'activado' : 'desactivado';
      res.redirect(`/espacios?success=Espacio+${estadoTexto}+exitosamente`);
    } catch (error) {
      console.error('[ESPACIOS] Error cambiando estado de aula:', error);
      res.redirect('/espacios?error=Error+al+modificar+estado+del+espacio');
    }
  }

  async crearSede(req: Request, res: Response) {
    try {
      const { codigo, nombre, ejeTerritorial, direccion, esAldeaMunicipalizada } = req.body;

      if (!codigo || !nombre || !ejeTerritorial) {
        return res.redirect('/espacios?tab=sedes&error=Código,+nombre+y+eje+territorial+son+obligatorios');
      }

      const codigoNormalizado = codigo.trim().toUpperCase();

      const existe = await prisma.sede.findUnique({ where: { codigo: codigoNormalizado } });
      if (existe) {
        return res.redirect('/espacios?tab=sedes&error=El+código+de+la+sede+ya+está+registrado');
      }

      await prisma.sede.create({
        data: {
          codigo: codigoNormalizado,
          nombre: nombre.trim(),
          ejeTerritorial: ejeTerritorial.trim(),
          direccion: direccion ? direccion.trim() : null,
          esAldeaMunicipalizada: esAldeaMunicipalizada === 'true' || esAldeaMunicipalizada === 'on',
          activa: true,
        },
      });

      res.redirect('/espacios?tab=sedes&success=Sede+o+Aldea+registrada+exitosamente');
    } catch (error) {
      console.error('[ESPACIOS] Error creando sede:', error);
      res.redirect('/espacios?tab=sedes&error=Error+al+registrar+la+sede');
    }
  }

  async editarSede(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { nombre, ejeTerritorial, direccion, esAldeaMunicipalizada } = req.body;

      await prisma.sede.update({
        where: { id },
        data: {
          nombre: nombre.trim(),
          ejeTerritorial: ejeTerritorial.trim(),
          direccion: direccion ? direccion.trim() : null,
          esAldeaMunicipalizada: esAldeaMunicipalizada === 'true' || esAldeaMunicipalizada === 'on',
        },
      });

      res.redirect('/espacios?tab=sedes&success=Sede+actualizada+correctamente');
    } catch (error) {
      console.error('[ESPACIOS] Error actualizando sede:', error);
      res.redirect('/espacios?tab=sedes&error=Error+al+actualizar+la+sede');
    }
  }

  async toggleSede(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const sede = await prisma.sede.findUnique({ where: { id } });

      if (!sede) {
        return res.redirect('/espacios?tab=sedes&error=Sede+no+encontrada');
      }

      await prisma.sede.update({
        where: { id },
        data: { activa: !sede.activa },
      });

      const estado = !sede.activa ? 'habilitada' : 'inhabilitada';
      res.redirect(`/espacios?tab=sedes&success=Sede+${estado}+correctamente`);
    } catch (error) {
      console.error('[ESPACIOS] Error alternando estado de sede:', error);
      res.redirect('/espacios?tab=sedes&error=Error+al+cambiar+estado+de+la+sede');
    }
  }
}
