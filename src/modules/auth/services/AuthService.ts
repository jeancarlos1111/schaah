import bcrypt from 'bcryptjs';
import prisma from '../../../core/database/prisma';
import { RolUsuario } from '../../../core/domain/enums';

export class AuthService {
  async validarCredenciales(email: string, passwordPlano: string) {
    const usuario = await prisma.usuario.findUnique({
      where: { email: email.toLowerCase().trim() },
      include: { profesor: true },
    });

    if (!usuario || !usuario.activo) {
      throw new Error('Credenciales inválidas o cuenta inactiva.');
    }

    const passwordValido = await bcrypt.compare(passwordPlano, usuario.passwordHash);
    if (!passwordValido) {
      throw new Error('Credenciales inválidas o cuenta inactiva.');
    }

    return {
      id: usuario.id,
      email: usuario.email,
      nombres: usuario.nombres,
      apellidos: usuario.apellidos,
      rol: usuario.rol as RolUsuario,
      profesorId: usuario.profesorId,
    };
  }

  async registrarUsuario(datos: {
    email: string;
    passwordPlano: string;
    nombres: string;
    apellidos: string;
    rol: RolUsuario;
    profesorId?: string;
  }) {
    const passwordHash = await bcrypt.hash(datos.passwordPlano, 10);

    return prisma.usuario.create({
      data: {
        email: datos.email.toLowerCase().trim(),
        passwordHash,
        nombres: datos.nombres,
        apellidos: datos.apellidos,
        rol: datos.rol,
        profesorId: datos.profesorId,
      },
    });
  }

  async contarUsuarios(): Promise<number> {
    return prisma.usuario.count();
  }
}

export const authService = new AuthService();
