import 'express-session';
import { RolUsuario } from '../core/domain/enums';

declare module 'express-session' {
  interface SessionData {
    usuario?: {
      id: string;
      email: string;
      nombres: string;
      apellidos: string;
      rol: RolUsuario;
      profesorId?: string | null;
    };
  }
}
