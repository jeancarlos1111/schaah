import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../../../core/database/prisma';
import { RolUsuario } from '../../../core/domain/enums';

export class UsuariosController {
  async index(req: Request, res: Response) {
    try {
      const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 10));
      const skip = (page - 1) * limit;

      const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
      const rolParam = typeof req.query.rol === 'string' ? req.query.rol.trim() : '';
      const estadoParam = typeof req.query.estado === 'string' ? req.query.estado.trim() : '';
      const sortBy = typeof req.query.sortBy === 'string' ? req.query.sortBy.trim() : 'createdAt';
      const sortDir = req.query.sortDir === 'asc' ? 'asc' : 'desc';

      const validSortColumns = ['nombres', 'email', 'rol', 'activo', 'createdAt'];
      const activeSortBy = validSortColumns.includes(sortBy) ? sortBy : 'createdAt';

      // Filtros a nivel de base de datos
      const where: any = {};
      if (rolParam) {
        where.rol = rolParam;
      }
      if (estadoParam === 'Activo' || estadoParam === 'true') {
        where.activo = true;
      } else if (estadoParam === 'Inactivo' || estadoParam === 'false') {
        where.activo = false;
      }

      if (q) {
        where.OR = [
          { nombres: { contains: q } },
          { apellidos: { contains: q } },
          { email: { contains: q } },
          { profesor: { cedula: { contains: q } } },
        ];
      }

      // Consultas concurrentes en base de datos: registros paginados, total filtrado y métricas globales
      const [
        totalFiltrados,
        usuarios,
        totalCuentas,
        totalAdmins,
        totalCoordinadores,
        totalDocentes,
        profesoresSinUsuario
      ] = await Promise.all([
        prisma.usuario.count({ where }),
        prisma.usuario.findMany({
          where,
          include: { profesor: true },
          orderBy: { [activeSortBy]: sortDir },
          skip,
          take: limit,
        }),
        prisma.usuario.count(),
        prisma.usuario.count({ where: { rol: 'ADMINISTRADOR' } }),
        prisma.usuario.count({ where: { rol: { in: ['DIRECTOR_ACADEMICO', 'COORDINADOR_PFG'] } } }),
        prisma.usuario.count({ where: { rol: 'DOCENTE' } }),
        prisma.profesor.findMany({
          where: {
            usuario: null,
            activo: true,
          },
          orderBy: { apellidos: 'asc' },
        }),
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
        rol: rolParam,
        estado: estadoParam,
        sortBy: activeSortBy,
        sortDir,
      };

      const stats = {
        total: totalCuentas,
        admins: totalAdmins,
        coordinadores: totalCoordinadores,
        docentes: totalDocentes,
      };

      res.render('pages/usuarios/index', {
        title: 'Gestión de Usuarios',
        usuarios,
        pagination,
        filters,
        stats,
        profesoresSinUsuario,
        rolesDisponibles: Object.values(RolUsuario),
        error: req.query.error || null,
        success: req.query.success || null,
      });
    } catch (error) {
      console.error('[USUARIOS] Error listando usuarios paginados:', error);
      res.status(500).render('pages/error', {
        title: 'Error de Servidor',
        statusCode: 500,
        mensaje: 'No se pudieron recuperar los usuarios del sistema.',
      });
    }
  }

  async crear(req: Request, res: Response) {
    const { email, password, nombres, apellidos, rol, profesorId } = req.body;

    try {
      if (!email || !password || !nombres || !apellidos || !rol) {
        return res.redirect('/usuarios?error=Todos+los+campos+obligatorios+deben+completarse');
      }

      const emailNormalizado = email.toLowerCase().trim();
      const existe = await prisma.usuario.findUnique({ where: { email: emailNormalizado } });

      if (existe) {
        return res.redirect('/usuarios?error=El+correo+institucional+ya+está+registrado');
      }

      const passwordHash = await bcrypt.hash(password, 10);

      await prisma.usuario.create({
        data: {
          email: emailNormalizado,
          passwordHash,
          nombres: nombres.trim(),
          apellidos: apellidos.trim(),
          rol: rol as RolUsuario,
          profesorId: profesorId && profesorId !== '' ? profesorId : null,
        },
      });

      res.redirect('/usuarios?success=Usuario+creado+exitosamente');
    } catch (error) {
      console.error('[USUARIOS] Error creando usuario:', error);
      res.redirect('/usuarios?error=Error+interno+al+crear+el+usuario');
    }
  }

  async editar(req: Request, res: Response) {
    const { id } = req.params;
    const { nombres, apellidos, rol } = req.body;

    try {
      if (!nombres || !apellidos || !rol) {
        return res.redirect('/usuarios?error=Nombres,+apellidos+y+rol+son+obligatorios');
      }

      const usuario = await prisma.usuario.findUnique({ where: { id } });
      if (!usuario) {
        return res.redirect('/usuarios?error=Usuario+no+encontrado');
      }

      // No permitir que el usuario actual se quite a sí mismo el rol de ADMINISTRADOR
      if (
        req.session.usuario &&
        req.session.usuario.id === usuario.id &&
        rol !== RolUsuario.ADMINISTRADOR
      ) {
        return res.redirect('/usuarios?error=No+puede+revocar+su+propio+rol+de+administrador');
      }

      await prisma.usuario.update({
        where: { id },
        data: {
          nombres: nombres.trim(),
          apellidos: apellidos.trim(),
          rol: rol as RolUsuario,
        },
      });

      // Si el usuario editado es la sesión actual, actualizar datos en sesión
      if (req.session.usuario && req.session.usuario.id === id) {
        req.session.usuario.nombres = nombres.trim();
        req.session.usuario.apellidos = apellidos.trim();
        req.session.usuario.rol = rol as RolUsuario;
      }

      res.redirect('/usuarios?success=Datos+del+usuario+actualizados+con+éxito');
    } catch (error) {
      console.error('[USUARIOS] Error editando usuario:', error);
      res.redirect('/usuarios?error=Error+al+editar+el+usuario');
    }
  }

  async resetPassword(req: Request, res: Response) {
    const { id } = req.params;
    const { nuevaPassword } = req.body;

    try {
      if (!nuevaPassword || nuevaPassword.length < 6) {
        return res.redirect('/usuarios?error=La+nueva+contraseña+debe+tener+al+menos+6+caracteres');
      }

      const usuario = await prisma.usuario.findUnique({ where: { id } });
      if (!usuario) {
        return res.redirect('/usuarios?error=Usuario+no+encontrado');
      }

      const passwordHash = await bcrypt.hash(nuevaPassword, 10);

      await prisma.usuario.update({
        where: { id },
        data: { passwordHash },
      });

      res.redirect(`/usuarios?success=Contraseña+reestablecida+para+${encodeURIComponent(usuario.email)}`);
    } catch (error) {
      console.error('[USUARIOS] Error reseteando contraseña:', error);
      res.redirect('/usuarios?error=Error+al+reestablecer+la+contraseña');
    }
  }

  async toggleEstado(req: Request, res: Response) {
    const { id } = req.params;

    try {
      const usuario = await prisma.usuario.findUnique({ where: { id } });
      if (!usuario) {
        return res.redirect('/usuarios?error=Usuario+no+encontrado');
      }

      // No permitir desactivarse a uno mismo
      if (req.session.usuario && req.session.usuario.id === usuario.id) {
        return res.redirect('/usuarios?error=No+puede+desactivar+su+propio+usuario');
      }

      await prisma.usuario.update({
        where: { id },
        data: { activo: !usuario.activo },
      });

      res.redirect('/usuarios?success=Estado+de+usuario+actualizado');
    } catch (error) {
      console.error('[USUARIOS] Error cambiando estado:', error);
      res.redirect('/usuarios?error=Error+al+cambiar+el+estado');
    }
  }
}

export const usuariosController = new UsuariosController();
