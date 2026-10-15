import { Router } from 'express';
import { HorariosController } from './controllers/HorariosController';
import { requireAuth, requireRole } from '../auth/middlewares/authMiddleware';
import { ROLES_PROGRAMACION_HORARIOS } from '../../core/domain/rules/alcancePfgRules';

const router = Router();

// Redirección general a período activo
router.get('/horarios', requireAuth, HorariosController.redirigirPeriodoActivo);

// Matriz de Horarios por Período
router.get('/periodos/:id/horarios', requireAuth, HorariosController.matriz);

// Endpoint de Validación Drag & Drop en tiempo real (Disponible para roles académicos)
router.post(
  '/periodos/:id/horarios/validar-drop',
  requireAuth,
  HorariosController.validarDrop
);

// Endpoints de Movimiento y Ajuste Manual (Protegidos con RBAC)
router.post(
  '/periodos/:id/horarios/mover',
  requireAuth,
  requireRole(ROLES_PROGRAMACION_HORARIOS),
  HorariosController.moverBloque
);

router.post(
  '/periodos/:id/horarios/eliminar',
  requireAuth,
  requireRole(ROLES_PROGRAMACION_HORARIOS),
  HorariosController.eliminarBloque
);

export default router;
