import { NextFunction, Request, Response } from 'express';
import prisma from '../../../core/database/prisma';
import { RolUsuario } from '../../../core/domain/enums';
import { AlcancePfg, ALCANCE_TOTAL, alcanceDeUsuario } from '../../../core/domain/rules/alcancePfgRules';

/**
 * Carga en cada petición los programas que coordina el usuario (Spec 06), de modo que
 * los cambios que haga el administrador apliquen sin volver a iniciar sesión.
 */
export async function cargarAlcancePfg(req: Request, res: Response, next: NextFunction) {
  const usuario = req.session?.usuario;
  try {
    if (usuario?.rol === RolUsuario.COORDINADOR_PFG) {
      const vinculos = await prisma.usuarioPrograma.findMany({
        where: { usuarioId: usuario.id, pfg: { activo: true } },
        select: { pfgId: true },
      });
      req.alcancePfg = alcanceDeUsuario(usuario.rol, vinculos.map((v) => v.pfgId));
    } else {
      req.alcancePfg = ALCANCE_TOTAL;
    }
  } catch (err) {
    console.error('[ALCANCE-PFG-ERROR]', err);
    req.alcancePfg = alcanceDeUsuario(usuario?.rol, []);
  }
  res.locals.alcancePfg = req.alcancePfg;
  next();
}

/** Alcance de la petición; si el middleware no corrió, un coordinador no obtiene acceso. */
export function alcanceDe(req: Request): AlcancePfg {
  return req.alcancePfg ?? alcanceDeUsuario(req.session?.usuario?.rol, []);
}

/** Respuesta 403 por programa ajeno, con el mismo formato que `requireRole`. */
export function denegarPfg(req: Request, res: Response, mensaje = 'El programa de formación no está entre los que usted coordina.') {
  const pideJson = req.headers.accept?.includes('application/json') || req.is('application/json');
  if (pideJson) {
    return res.status(403).json({ ok: false, error: `Acceso denegado: ${mensaje}` });
  }
  return res.status(403).render('pages/error', {
    title: 'Acceso Denegado',
    statusCode: 403,
    mensaje,
  });
}
