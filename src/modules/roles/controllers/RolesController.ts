import { Request, Response } from 'express';
import prisma from '../../../core/database/prisma';

export class RolesController {
  async index(req: Request, res: Response) {
    try {
      const roles = await prisma.rol.findMany({
        include: {
          permisos: {
            include: { permiso: true },
          },
          _count: { select: { usuarios: true } },
        },
        orderBy: { esSistema: 'desc' },
      });

      const permisos = await prisma.permiso.findMany({
        orderBy: [{ modulo: 'asc' }, { codigo: 'asc' }],
      });

      // Agrupar permisos por módulo
      const modulosMap = new Map<string, typeof permisos>();
      for (const p of permisos) {
        if (!modulosMap.has(p.modulo)) {
          modulosMap.set(p.modulo, []);
        }
        modulosMap.get(p.modulo)!.push(p);
      }

      // Crear mapa rápido de permisos por rol para la vista: Set(`${rolId}_${permisoId}`)
      const permisosActivosSet = new Set<string>();
      for (const rol of roles) {
        for (const rp of rol.permisos) {
          permisosActivosSet.add(`${rol.id}_${rp.permisoId}`);
        }
      }

      res.render('pages/roles/index', {
        title: 'Roles y Permisos',
        roles,
        permisos,
        modulos: Array.from(modulosMap.entries()).map(([nombre, lista]) => ({ nombre, lista })),
        permisosActivosSet,
        error: req.query.error || null,
        success: req.query.success || null,
      });
    } catch (error) {
      console.error('[ROLES] Error cargando matriz:', error);
      res.status(500).render('pages/error', {
        title: 'Error de Servidor',
        statusCode: 500,
        mensaje: 'No se pudo cargar la matriz de roles y permisos.',
      });
    }
  }

  async guardarMatriz(req: Request, res: Response) {
    try {
      // req.body contiene checkboxes con el formato: permiso_${rolId}_${permisoId} = 'on'
      const roles = await prisma.rol.findMany({ select: { id: true, codigo: true, esSistema: true } });
      const permisos = await prisma.permiso.findMany({ select: { id: true } });

      const nuevasAsignaciones: { rolId: string; permisoId: string }[] = [];

      for (const rol of roles) {
        // El rol ADMINISTRADOR siempre conserva todos los permisos por regla de seguridad
        if (rol.codigo === 'ADMINISTRADOR') {
          for (const perm of permisos) {
            nuevasAsignaciones.push({ rolId: rol.id, permisoId: perm.id });
          }
          continue;
        }

        for (const perm of permisos) {
          const key = `permiso_${rol.id}_${perm.id}`;
          if (req.body[key] === 'on' || req.body[key] === 'true') {
            nuevasAsignaciones.push({ rolId: rol.id, permisoId: perm.id });
          }
        }
      }

      // Transacción atómica: limpiar y reconstruir asignaciones
      await prisma.$transaction(async (tx) => {
        await tx.rolPermiso.deleteMany({});
        for (const asig of nuevasAsignaciones) {
          await tx.rolPermiso.create({
            data: asig,
          });
        }
      });

      res.redirect('/roles?success=Matriz+de+permisos+actualizada+exitosamente');
    } catch (error) {
      console.error('[ROLES] Error guardando matriz:', error);
      res.redirect('/roles?error=Error+al+guardar+la+matriz+de+permisos');
    }
  }

  async crearRol(req: Request, res: Response) {
    const { codigo, nombre, descripcion } = req.body;

    try {
      if (!codigo || !nombre) {
        return res.redirect('/roles?error=Código+y+nombre+son+obligatorios');
      }

      const codigoNormalizado = codigo.toUpperCase().trim().replace(/[^A-Z0-9_]/g, '_');
      const existe = await prisma.rol.findUnique({ where: { codigo: codigoNormalizado } });

      if (existe) {
        return res.redirect('/roles?error=El+código+del+rol+ya+existe');
      }

      await prisma.rol.create({
        data: {
          codigo: codigoNormalizado,
          nombre: nombre.trim(),
          descripcion: descripcion ? descripcion.trim() : null,
          esSistema: false,
        },
      });

      res.redirect('/roles?success=Rol+creado+exitosamente.+Ahora+puede+asignarle+permisos.');
    } catch (error) {
      console.error('[ROLES] Error creando rol:', error);
      res.redirect('/roles?error=Error+al+crear+el+rol');
    }
  }
}

export const rolesController = new RolesController();
