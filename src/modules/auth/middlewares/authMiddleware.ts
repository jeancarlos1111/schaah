import { Request, Response, NextFunction } from 'express';
import { RolUsuario } from '../../../core/domain/enums';

export function attachUserToLocals(req: Request, res: Response, next: NextFunction) {
  res.locals.usuario = req.session.usuario || null;
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.usuario) {
    if (req.xhr || req.headers['hx-request']) {
      return res.status(401).send('<div class="alert alert-error">Sesión expirada. Por favor inicie sesión nuevamente.</div>');
    }
    return res.redirect('/login');
  }
  next();
}

export function requireRole(...rolesPermitidos: RolUsuario[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.session.usuario) {
      return res.redirect('/login');
    }

    if (!rolesPermitidos.includes(req.session.usuario.rol)) {
      return res.status(403).render('pages/error', {
        title: 'Acceso Denegado',
        statusCode: 403,
        mensaje: `No tiene privilegios suficientes (${req.session.usuario.rol}) para realizar esta acción.`,
      });
    }

    next();
  };
}
