import { Router } from 'express';
import { rolesController } from './controllers/RolesController';
import { requireAuth, requireRole } from '../auth/middlewares/authMiddleware';
import { RolUsuario } from '../../core/domain/enums';

const router = Router();

// Todas las rutas de gestión de roles y matriz de permisos son exclusivas de ADMINISTRADOR
router.get(
  '/roles',
  requireAuth,
  requireRole(RolUsuario.ADMINISTRADOR),
  (req, res) => rolesController.index(req, res)
);

router.post(
  '/roles/matriz',
  requireAuth,
  requireRole(RolUsuario.ADMINISTRADOR),
  (req, res) => rolesController.guardarMatriz(req, res)
);

router.post(
  '/roles/nuevo',
  requireAuth,
  requireRole(RolUsuario.ADMINISTRADOR),
  (req, res) => rolesController.crearRol(req, res)
);

export default router;
