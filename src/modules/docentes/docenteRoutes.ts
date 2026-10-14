import { Router } from 'express';
import { DocentesController } from './controllers/DocentesController';
import { requireAuth, requireRole } from '../auth/middlewares/authMiddleware';
import { RolUsuario } from '../../core/domain/enums';

const router = Router();
const docentesController = new DocentesController();

const ROLES_GESTION_DOCENTES = [
  RolUsuario.ADMINISTRADOR,
  RolUsuario.DIRECTOR_ACADEMICO,
  RolUsuario.COORDINADOR_PFG,
];

// Planilla Consolidada de Carga Horaria UBV (colocada antes de /:id para evitar colisión de ruta)
router.get(
  '/docentes/carga-consolidada',
  requireAuth,
  requireRole(...ROLES_GESTION_DOCENTES),
  (req, res) => docentesController.cargaConsolidada(req, res)
);

// Listado de Docentes con SahadDataTable
router.get(
  '/docentes',
  requireAuth,
  requireRole(...ROLES_GESTION_DOCENTES),
  (req, res) => docentesController.index(req, res)
);

// Registro de Nuevo Docente
router.post(
  '/docentes',
  requireAuth,
  requireRole(...ROLES_GESTION_DOCENTES),
  (req, res) => docentesController.crear(req, res)
);

// Edición de Docente
router.post(
  '/docentes/:id/editar',
  requireAuth,
  requireRole(...ROLES_GESTION_DOCENTES),
  (req, res) => docentesController.editar(req, res)
);

// Conmutar Estado Activo / Inactivo
router.post(
  '/docentes/:id/toggle',
  requireAuth,
  requireRole(...ROLES_GESTION_DOCENTES),
  (req, res) => docentesController.toggle(req, res)
);

// Acceso directo a disponibilidad propia para el usuario docente autenticado
router.get(
  '/mi-disponibilidad',
  requireAuth,
  (req, res) => docentesController.miDisponibilidad(req, res)
);

// Matriz Semanal de Disponibilidad y Preferencias (accesible por coordinadores y docentes)
router.get(
  '/docentes/:id/disponibilidad',
  requireAuth,
  (req, res) => docentesController.disponibilidad(req, res)
);

// Guardar Disponibilidad
router.post(
  '/docentes/:id/disponibilidad',
  requireAuth,
  (req, res) => docentesController.guardarDisponibilidad(req, res)
);

export default router;
