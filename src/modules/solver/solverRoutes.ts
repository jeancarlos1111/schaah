import { Router } from 'express';
import { SolverController } from './controllers/SolverController';
import { requireAuth, requireRole } from '../auth/middlewares/authMiddleware';
import { RolUsuario } from '../../core/domain/enums';

const router = Router();

// Rutas de Solver de Optimización Automática de Horarios
router.get(
  '/periodos/:id/solver/diagnostico',
  requireAuth,
  requireRole([RolUsuario.ADMINISTRADOR, RolUsuario.DIRECTOR_ACADEMICO, RolUsuario.COORDINADOR_PFG]),
  SolverController.diagnostico
);

router.post(
  '/periodos/:id/solver/ejecutar',
  requireAuth,
  requireRole([RolUsuario.ADMINISTRADOR, RolUsuario.DIRECTOR_ACADEMICO]),
  SolverController.ejecutar
);

router.post(
  '/periodos/:id/solver/aplicar',
  requireAuth,
  requireRole([RolUsuario.ADMINISTRADOR, RolUsuario.DIRECTOR_ACADEMICO]),
  SolverController.aplicar
);

export default router;
