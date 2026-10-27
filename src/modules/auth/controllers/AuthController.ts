import { Request, Response } from 'express';
import { authService } from '../services/AuthService';
import { AuditService } from '../../../core/audit/auditService';

export class AuthController {
  showLogin(req: Request, res: Response) {
    if (req.session.usuario) {
      return res.redirect('/');
    }
    res.render('pages/auth/login', {
      title: 'Iniciar Sesión',
      error: null,
      email: '',
      layout: false,
    });
  }

  async login(req: Request, res: Response) {
    const { email, password } = req.body;

    try {
      if (!email || !password) {
        return res.render('pages/auth/login', {
          title: 'Iniciar Sesión',
          error: 'Debe ingresar correo institucional y contraseña.',
          email: email || '',
          layout: false,
        });
      }

      const usuario = await authService.validarCredenciales(email, password);

      // Registrar evento de login en bitácora de auditoría
      await AuditService.registrar({
        usuarioId: usuario.id,
        usuarioEmail: usuario.email,
        usuarioNombre: `${usuario.nombres} ${usuario.apellidos}`,
        rol: usuario.rol,
        accion: 'LOGIN',
        entidad: 'USUARIO',
        entidadId: usuario.id,
        detalles: `Inicio de sesión exitoso`,
        ip: req.ip || req.socket?.remoteAddress || null,
      });

      // Guardar en sesión
      req.session.usuario = usuario;

      req.session.save((err) => {
        if (err) {
          console.error('Error guardando sesión:', err);
          return res.status(500).render('pages/auth/login', {
            title: 'Iniciar Sesión',
            error: 'Error al iniciar sesión. Intente nuevamente.',
            email,
            layout: false,
          });
        }
        res.redirect('/');
      });
    } catch (err: any) {
      res.render('pages/auth/login', {
        title: 'Iniciar Sesión',
        error: err.message || 'Error de autenticación.',
        email,
        layout: false,
      });
    }
  }

  logout(req: Request, res: Response) {
    req.session.destroy((err) => {
      if (err) {
        console.error('Error cerrando sesión:', err);
      }
      res.clearCookie('connect.sid');
      res.redirect('/login');
    });
  }
}

export const authController = new AuthController();
