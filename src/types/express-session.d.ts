import 'express-session';
import { RolUsuario } from '../core/domain/enums';
import { AlcancePfg } from '../core/domain/rules/alcancePfgRules';

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
    ofertaPreviewToken?: string;
  }
}

declare global {
  namespace Express {
    interface Request {
      /** Programas que puede ver y modificar el usuario (middleware `cargarAlcancePfg`). */
      alcancePfg?: AlcancePfg;
    }
  }
}
