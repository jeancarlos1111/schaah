import { Router } from 'express';
import { auditoriaController } from './controllers/AuditoriaController';
import { requireAuth, requireRole } from '../auth/middlewares/authMiddleware';
import { RolUsuario } from '../../core/domain/enums';

const router = Router();

// Exclusivo para ADMINISTRADOR (La planificadora y demás roles no tienen acceso al historial)
router.get(
  '/auditoria',
  requireAuth,
  requireRole(RolUsuario.ADMINISTRADOR),
  (req, res) => auditoriaController.index(req, res)
);

export default router;
