import { Router } from 'express';
import { EspaciosController } from './controllers/EspaciosController';
import { requireAuth, requireRole } from '../auth/middlewares/authMiddleware';
import { RolUsuario } from '../../core/domain/enums';

const router = Router();
const espaciosController = new EspaciosController();

const ROLES_LECTURA_ESPACIOS = [
  RolUsuario.ADMINISTRADOR,
  RolUsuario.PLANIFICADOR,
  RolUsuario.COORDINADOR_PFG,
];

// Spec 06 y Reunión: el planificador gestiona recintos pero no los habilita/deshabilita
const ROLES_GESTION_ESPACIOS = [RolUsuario.ADMINISTRADOR, RolUsuario.PLANIFICADOR];

// Listado de Espacios y Sedes
router.get(
  '/espacios',
  requireAuth,
  requireRole(...ROLES_LECTURA_ESPACIOS),
  (req, res) => espaciosController.index(req, res)
);

// Gestión de Aulas y Laboratorios
router.post(
  '/espacios/aulas',
  requireAuth,
  requireRole(...ROLES_GESTION_ESPACIOS),
  (req, res) => espaciosController.crearAula(req, res)
);

router.post(
  '/espacios/aulas/:id/editar',
  requireAuth,
  requireRole(...ROLES_GESTION_ESPACIOS),
  (req, res) => espaciosController.editarAula(req, res)
);

router.post(
  '/espacios/aulas/:id/toggle',
  requireAuth,
  requireRole(RolUsuario.ADMINISTRADOR),
  (req, res) => espaciosController.toggleAula(req, res)
);

// Gestión de Sedes y Aldeas Municipalizadas
router.post(
  '/espacios/sedes/nueva',
  requireAuth,
  requireRole(...ROLES_GESTION_ESPACIOS),
  (req, res) => espaciosController.crearSede(req, res)
);

router.post(
  '/espacios/sedes/:id/editar',
  requireAuth,
  requireRole(...ROLES_GESTION_ESPACIOS),
  (req, res) => espaciosController.editarSede(req, res)
);

router.post(
  '/espacios/sedes/:id/toggle',
  requireAuth,
  requireRole(RolUsuario.ADMINISTRADOR),
  (req, res) => espaciosController.toggleSede(req, res)
);

export default router;
