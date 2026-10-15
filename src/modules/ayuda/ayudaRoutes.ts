import express, { Request, Response, Router } from 'express';
import { cargarManualUsuario, DIRECTORIO_IMAGENES_MANUAL } from './manualRenderer';

const router = Router();

// Capturas del manual: docs/img se publica bajo /ayuda/img para que las rutas relativas del Markdown funcionen
router.use('/ayuda/img', express.static(DIRECTORIO_IMAGENES_MANUAL, { fallthrough: false }));

export function manualUsuario(req: Request, res: Response) {
  const manual = cargarManualUsuario();
  res.render('pages/ayuda/manual-usuario', {
    title: 'Manual de Usuario',
    manual,
  });
}

router.get('/ayuda/manual-usuario', manualUsuario);

router.get('/ayuda/manual-tecnico', (req: Request, res: Response) => {
  res.render('pages/ayuda/manual-tecnico', {
    title: 'Manual Técnico',
  });
});

export default router;
