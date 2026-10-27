import { NextFunction, Request, Response, Router } from 'express';
import multer from 'multer';
import { OfertaController } from './controllers/OfertaController';
import { requireAuth, requireRole } from '../auth/middlewares/authMiddleware';
import { RolUsuario } from '../../core/domain/enums';

const router = Router();

const TAMANO_MAXIMO_BYTES = 15 * 1024 * 1024;
const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const subida = multer({
  storage: multer.memoryStorage(),
  // Los navegadores envían el nombre del archivo en UTF-8; con el valor por defecto (latin1) las tildes llegan corruptas.
  defParamCharset: 'utf8',
  limits: { fileSize: TAMANO_MAXIMO_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const esXlsx = file.originalname.toLowerCase().endsWith('.xlsx') || file.mimetype === MIME_XLSX;
    if (esXlsx) cb(null, true);
    else cb(new Error('Solo se aceptan libros de Excel con extensión .xlsx.'));
  },
});

export function recibirArchivo(req: Request, res: Response, next: NextFunction) {
  subida.single('archivo')(req, res, (err: unknown) => {
    if (!err) return next();
    const mensaje =
      err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE'
        ? 'El archivo supera el tamaño máximo permitido (15 MB).'
        : err instanceof Error
          ? err.message
          : 'No se pudo recibir el archivo.';
    return res.redirect(`/periodos/${req.params.id}/oferta?error=${encodeURIComponent(mensaje)}`);
  });
}

const gestores = requireRole([RolUsuario.ADMINISTRADOR, RolUsuario.PLANIFICADOR]);
const gestoresCurriculares = requireRole([
  RolUsuario.ADMINISTRADOR,
  RolUsuario.PLANIFICADOR,
  RolUsuario.COORDINADOR_PFG,
]);

router.get('/periodos/:id/oferta', requireAuth, OfertaController.index);
router.get('/periodos/:id/oferta/exportar.xlsx', requireAuth, OfertaController.exportar);
router.get('/periodos/:id/oferta/inconsistencias', requireAuth, OfertaController.inconsistencias);
router.get('/periodos/:id/oferta/inconsistencias.xlsx', requireAuth, OfertaController.exportarInconsistencias);
router.post(
  '/periodos/:id/oferta/unidades/:unidadId/codigo',
  requireAuth,
  gestoresCurriculares,
  OfertaController.confirmarCodigoUnidad
);
router.post('/periodos/:id/oferta/importar', requireAuth, gestores, recibirArchivo, OfertaController.importar);
router.get('/periodos/:id/oferta/vista-previa', requireAuth, gestores, OfertaController.vistaPrevia);
router.post('/periodos/:id/oferta/confirmar', requireAuth, gestores, OfertaController.confirmar);
router.post('/periodos/:id/oferta/cancelar', requireAuth, gestores, OfertaController.cancelar);

export default router;
