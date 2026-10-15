import { Router } from 'express';
import { SolverController } from './controllers/SolverController';
import { requireAuth, requireRole } from '../auth/middlewares/authMiddleware';
import { ROLES_PROGRAMACION_HORARIOS } from '../../core/domain/rules/alcancePfgRules';

const router = Router();

// Rutas de Solver de Optimización Automática de Horarios
// El coordinador ejecuta y aplica el solver solo sobre las secciones de sus programas (Spec 06)
router.get(
  '/periodos/:id/solver/diagnostico',
  requireAuth,
  requireRole(ROLES_PROGRAMACION_HORARIOS),
  SolverController.diagnostico
);

router.post(
  '/periodos/:id/solver/ejecutar',
  requireAuth,
  requireRole(ROLES_PROGRAMACION_HORARIOS),
  SolverController.ejecutar
);

router.post(
  '/periodos/:id/solver/aplicar',
  requireAuth,
  requireRole(ROLES_PROGRAMACION_HORARIOS),
  SolverController.aplicar
);

export default router;
