import { Router } from 'express';
import { usuariosController } from './controllers/UsuariosController';
import { requireAuth, requireRole } from '../auth/middlewares/authMiddleware';
import { RolUsuario } from '../../core/domain/enums';

const router = Router();

// Rutas de administración de usuarios (Exclusivas para ADMINISTRADOR)
router.get(
  '/usuarios',
  requireAuth,
  requireRole(RolUsuario.ADMINISTRADOR),
  (req, res) => usuariosController.index(req, res)
);

router.post(
  '/usuarios',
  requireAuth,
  requireRole(RolUsuario.ADMINISTRADOR),
  (req, res) => usuariosController.crear(req, res)
);

router.post(
  '/usuarios/:id/editar',
  requireAuth,
  requireRole(RolUsuario.ADMINISTRADOR),
  (req, res) => usuariosController.editar(req, res)
);

router.post(
  '/usuarios/:id/reset-password',
  requireAuth,
  requireRole(RolUsuario.ADMINISTRADOR),
  (req, res) => usuariosController.resetPassword(req, res)
);

router.post(
  '/usuarios/:id/toggle',
  requireAuth,
  requireRole(RolUsuario.ADMINISTRADOR),
  (req, res) => usuariosController.toggleEstado(req, res)
);

export default router;
