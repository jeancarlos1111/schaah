import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../../../core/database/prisma';
import { RolUsuario } from '../../../core/domain/enums';
import { resolverProgramasCoordinador } from '../../../core/domain/rules/alcancePfgRules';
import { AuditService } from '../../../core/audit/auditService';

/** Valida contra la base los programas elegidos para un coordinador (Spec 06). */
async function programasCoordinador(rol: string, valor: unknown): Promise<{ pfgIds: string[] } | { error: string }> {
  const resuelto = resolverProgramasCoordinador(rol, valor);
  if (!resuelto.valido) return { error: resuelto.error };
  if (resuelto.pfgIds.length === 0) return { pfgIds: [] };
  const existentes = await prisma.programaFormacion.count({ where: { id: { in: resuelto.pfgIds } } });
  if (existentes !== resuelto.pfgIds.length) return { error: 'Alguno de los programas seleccionados no existe.' };
  return { pfgIds: resuelto.pfgIds };
}

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
        profesoresSinUsuario,
        programas,
      ] = await Promise.all([
        prisma.usuario.count({ where }),
        prisma.usuario.findMany({
          where,
          include: {
            profesor: true,
            programas: { include: { pfg: { select: { id: true, codigo: true, nombre: true } } } },
          },
          orderBy: { [activeSortBy]: sortDir },
          skip,
          take: limit,
        }),
        prisma.usuario.count(),
        prisma.usuario.count({ where: { rol: 'ADMINISTRADOR' } }),
        prisma.usuario.count({ where: { rol: { in: ['PLANIFICADOR', 'DIRECTOR_ACADEMICO', 'COORDINADOR_PFG'] } } }),
        prisma.usuario.count({ where: { rol: 'DOCENTE' } }),
        prisma.profesor.findMany({
          where: {
            usuario: null,
            activo: true,
          },
          orderBy: { apellidos: 'asc' },
        }),
        prisma.programaFormacion.findMany({
          where: { activo: true },
          select: { id: true, codigo: true, nombre: true, tipo: true },
          orderBy: { codigo: 'asc' },
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
        programas,
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

      const programasElegidos = await programasCoordinador(rol, req.body.programas);
      if ('error' in programasElegidos) {
        return res.redirect(`/usuarios?error=${encodeURIComponent(programasElegidos.error)}`);
      }

      const passwordHash = await bcrypt.hash(password, 10);

      const nuevoUsuario = await prisma.usuario.create({
        data: {
          email: emailNormalizado,
          passwordHash,
          nombres: nombres.trim(),
          apellidos: apellidos.trim(),
          rol: rol as RolUsuario,
          profesorId: profesorId && profesorId !== '' ? profesorId : null,
          programas: { create: programasElegidos.pfgIds.map((pfgId) => ({ pfgId })) },
        },
      });

      if (req.session.usuario) {
        await AuditService.registrar({
          usuarioId: req.session.usuario.id,
          usuarioEmail: req.session.usuario.email,
          usuarioNombre: `${req.session.usuario.nombres} ${req.session.usuario.apellidos}`,
          rol: req.session.usuario.rol,
          accion: 'CREAR',
          entidad: 'USUARIO',
          entidadId: nuevoUsuario.id,
          detalles: `Creación de usuario ${nuevoUsuario.email} con rol ${nuevoUsuario.rol}`,
          datosNuevos: { email: nuevoUsuario.email, rol: nuevoUsuario.rol, nombres: nuevoUsuario.nombres, apellidos: nuevoUsuario.apellidos },
          ip: req.ip || req.socket?.remoteAddress || null,
        });
      }

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

      const programasElegidos = await programasCoordinador(rol, req.body.programas);
      if ('error' in programasElegidos) {
        return res.redirect(`/usuarios?error=${encodeURIComponent(programasElegidos.error)}`);
      }

      await prisma.$transaction([
        prisma.usuario.update({
          where: { id },
          data: {
            nombres: nombres.trim(),
            apellidos: apellidos.trim(),
            rol: rol as RolUsuario,
          },
        }),
        prisma.usuarioPrograma.deleteMany({ where: { usuarioId: id, pfgId: { notIn: programasElegidos.pfgIds } } }),
        ...programasElegidos.pfgIds.map((pfgId) =>
          prisma.usuarioPrograma.upsert({
            where: { usuarioId_pfgId: { usuarioId: id, pfgId } },
            update: {},
            create: { usuarioId: id, pfgId },
          }),
        ),
      ]);

      if (req.session.usuario) {
        await AuditService.registrar({
          usuarioId: req.session.usuario.id,
          usuarioEmail: req.session.usuario.email,
          usuarioNombre: `${req.session.usuario.nombres} ${req.session.usuario.apellidos}`,
          rol: req.session.usuario.rol,
          accion: 'EDITAR',
          entidad: 'USUARIO',
          entidadId: id,
          detalles: `Modificación de usuario ${usuario.email}`,
          datosAnteriores: { nombres: usuario.nombres, apellidos: usuario.apellidos, rol: usuario.rol },
          datosNuevos: { nombres: nombres.trim(), apellidos: apellidos.trim(), rol },
          ip: req.ip || req.socket?.remoteAddress || null,
        });
      }

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

      if (req.session.usuario) {
        await AuditService.registrar({
          usuarioId: req.session.usuario.id,
          usuarioEmail: req.session.usuario.email,
          usuarioNombre: `${req.session.usuario.nombres} ${req.session.usuario.apellidos}`,
          rol: req.session.usuario.rol,
          accion: 'EDITAR',
          entidad: 'USUARIO',
          entidadId: id,
          detalles: `Reestablecimiento forzado de contraseña para ${usuario.email}`,
          ip: req.ip || req.socket?.remoteAddress || null,
        });
      }

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

      const nuevoEstado = !usuario.activo;

      await prisma.usuario.update({
        where: { id },
        data: { activo: nuevoEstado },
      });

      if (req.session.usuario) {
        await AuditService.registrar({
          usuarioId: req.session.usuario.id,
          usuarioEmail: req.session.usuario.email,
          usuarioNombre: `${req.session.usuario.nombres} ${req.session.usuario.apellidos}`,
          rol: req.session.usuario.rol,
          accion: nuevoEstado ? 'ACTIVAR' : 'DESACTIVAR',
          entidad: 'USUARIO',
          entidadId: id,
          detalles: `${nuevoEstado ? 'Activación' : 'Desactivación'} de cuenta de usuario ${usuario.email}`,
          datosAnteriores: { activo: usuario.activo },
          datosNuevos: { activo: nuevoEstado },
          ip: req.ip || req.socket?.remoteAddress || null,
        });
      }

      res.redirect('/usuarios?success=Estado+de+usuario+actualizado');
    } catch (error) {
      console.error('[USUARIOS] Error cambiando estado:', error);
      res.redirect('/usuarios?error=Error+al+cambiar+el+estado');
    }
  }
}

export const usuariosController = new UsuariosController();
