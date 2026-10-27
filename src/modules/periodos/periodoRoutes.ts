import { Router } from 'express';
import { PeriodosController } from './controllers/PeriodosController';
import { requireAuth, requireRole } from '../auth/middlewares/authMiddleware';
import { RolUsuario } from '../../core/domain/enums';

const router = Router();

// Períodos Académicos
router.get('/periodos', requireAuth, PeriodosController.index);
router.post(
  '/periodos',
  requireAuth,
  requireRole([RolUsuario.ADMINISTRADOR, RolUsuario.PLANIFICADOR]),
  PeriodosController.crearPeriodo
);
router.post(
  '/periodos/:id/estado',
  requireAuth,
  requireRole([RolUsuario.ADMINISTRADOR, RolUsuario.PLANIFICADOR]),
  PeriodosController.cambiarEstado
);

// Secciones del Período
router.get('/periodos/:id/secciones', requireAuth, PeriodosController.secciones);
router.post(
  '/periodos/:id/secciones',
  requireAuth,
  requireRole([RolUsuario.ADMINISTRADOR, RolUsuario.PLANIFICADOR, RolUsuario.COORDINADOR_PFG]),
  PeriodosController.crearSeccion
);
router.post(
  '/periodos/:id/grupos',
  requireAuth,
  requireRole([RolUsuario.ADMINISTRADOR, RolUsuario.PLANIFICADOR, RolUsuario.COORDINADOR_PFG]),
  PeriodosController.crearGrupo
);
router.post(
  '/periodos/:id/secciones/:seccionId/asignar-profesor',
  requireAuth,
  requireRole([RolUsuario.ADMINISTRADOR, RolUsuario.PLANIFICADOR, RolUsuario.COORDINADOR_PFG]),
  PeriodosController.asignarDocente
);
router.post(
  '/periodos/:id/secciones/:seccionId/eliminar',
  requireAuth,
  requireRole([RolUsuario.ADMINISTRADOR, RolUsuario.PLANIFICADOR]),
  PeriodosController.eliminarSeccion
);

export default router;
