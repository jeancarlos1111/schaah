import { Router } from 'express';
import { HorariosController } from './controllers/HorariosController';
import { requireAuth, requireRole } from '../auth/middlewares/authMiddleware';
import { RolUsuario } from '../../core/domain/enums';

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
  requireRole([RolUsuario.ADMINISTRADOR, RolUsuario.DIRECTOR_ACADEMICO, RolUsuario.COORDINADOR_PFG]),
  HorariosController.moverBloque
);

router.post(
  '/periodos/:id/horarios/eliminar',
  requireAuth,
  requireRole([RolUsuario.ADMINISTRADOR, RolUsuario.DIRECTOR_ACADEMICO, RolUsuario.COORDINADOR_PFG]),
  HorariosController.eliminarBloque
);

export default router;
