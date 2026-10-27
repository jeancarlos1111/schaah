import { Router } from 'express';
import { CurriculoController } from './controllers/CurriculoController';
import { requireAuth, requireRole } from '../auth/middlewares/authMiddleware';
import { RolUsuario } from '../../core/domain/enums';

const router = Router();

// Panel central de Mallas y Unidades Curriculares
router.get(
  '/curriculo',
  requireAuth,
  requireRole(
    RolUsuario.ADMINISTRADOR,
    RolUsuario.PLANIFICADOR,
    RolUsuario.COORDINADOR_PFG
  ),
  CurriculoController.index
);

// Gestión de Programas de Formación de Grado (PFG)
router.post(
  '/curriculo/pfg',
  requireAuth,
  requireRole(RolUsuario.ADMINISTRADOR, RolUsuario.PLANIFICADOR),
  CurriculoController.crearPfg
);

router.post(
  '/curriculo/pfg/:id/editar',
  requireAuth,
  requireRole(RolUsuario.ADMINISTRADOR, RolUsuario.PLANIFICADOR),
  CurriculoController.editarPfg
);

router.post(
  '/curriculo/pfg/:id/toggle',
  requireAuth,
  requireRole(RolUsuario.ADMINISTRADOR),
  CurriculoController.togglePfg
);

// Gestión de Unidades Curriculares
router.post(
  '/curriculo/unidades',
  requireAuth,
  requireRole(
    RolUsuario.ADMINISTRADOR,
    RolUsuario.PLANIFICADOR,
    RolUsuario.COORDINADOR_PFG
  ),
  CurriculoController.crearUnidad
);

router.post(
  '/curriculo/unidades/:id/editar',
  requireAuth,
  requireRole(
    RolUsuario.ADMINISTRADOR,
    RolUsuario.PLANIFICADOR,
    RolUsuario.COORDINADOR_PFG
  ),
  CurriculoController.editarUnidad
);

router.post(
  '/curriculo/unidades/:id/toggle',
  requireAuth,
  requireRole(RolUsuario.ADMINISTRADOR),
  CurriculoController.toggleUnidad
);

// API Reactiva para catálogos dependientes (Secciones, Solver, etc.)
router.get(
  '/curriculo/api/pfg/:id/unidades',
  requireAuth,
  CurriculoController.apiUnidades
);

export default router;
