import type { Request, Response } from 'express';
import { RolUsuario } from '../../src/core/domain/enums';

export interface UsuarioSesion {
  id: string;
  email: string;
  nombres: string;
  apellidos: string;
  rol: RolUsuario;
  profesorId?: string | null;
}

export interface RespuestaCapturada {
  status: number;
  json?: any;
  redirect?: string;
  vista?: string;
  locals?: any;
}

interface OpcionesPeticion {
  usuario: UsuarioSesion;
  params?: Record<string, string>;
  body?: Record<string, unknown>;
  query?: Record<string, string>;
  json?: boolean;
  session?: Record<string, unknown>;
  /** Archivo subido (equivalente a `req.file` de multer en memoria). */
  archivo?: { buffer: Buffer; originalname: string };
}

/**
 * Petición Express mínima con la sesión del usuario. El alcance por programa se calcula con el
 * middleware real `cargarAlcancePfg` contra la base activa, igual que en el servidor.
 */
export async function peticion(opciones: OpcionesPeticion): Promise<Request> {
  const json = opciones.json ?? false;
  const req = {
    params: opciones.params ?? {},
    body: opciones.body ?? {},
    query: opciones.query ?? {},
    headers: { accept: json ? 'application/json' : 'text/html' },
    session: { usuario: opciones.usuario, ...opciones.session },
    originalUrl: '/',
    file: opciones.archivo,
    is: (tipo: string) => (json && tipo === 'application/json' ? tipo : false),
  } as unknown as Request;
  await verificarBaseGlobal();
  const { cargarAlcancePfg } = await import('../../src/modules/auth/middlewares/alcancePfg');
  await cargarAlcancePfg(req, { locals: {} } as Response, () => undefined);
  return req;
}

let baseGlobalVerificada = false;

/**
 * El cliente global toma DATABASE_URL al crearse: si algún import estático lo cargó antes de
 * `crearBaseTemporal`, los controladores escribirían en la base de desarrollo. Se detiene la prueba.
 */
async function verificarBaseGlobal() {
  if (baseGlobalVerificada) return;
  const prisma = (await import('../../src/core/database/prisma')).default;
  const [principal] = await prisma.$queryRawUnsafe<{ file: string }[]>('PRAGMA database_list');
  const esperada = (process.env.DATABASE_URL ?? '').replace(/^file:/, '');
  if (principal.file !== esperada) {
    throw new Error(`El cliente Prisma global apunta a ${principal.file} y no a la base temporal ${esperada}.`);
  }
  baseGlobalVerificada = true;
}

/** Respuesta Express que registra el código, el JSON, la redirección o la vista renderizada. */
export function respuesta(): { res: Response; capturada: RespuestaCapturada } {
  const capturada: RespuestaCapturada = { status: 200 };
  const res = {
    locals: {},
    status(codigo: number) {
      capturada.status = codigo;
      return this;
    },
    json(cuerpo: unknown) {
      capturada.json = cuerpo;
      return this;
    },
    redirect(url: string) {
      if (capturada.status === 200) capturada.status = 302;
      capturada.redirect = url;
      return this;
    },
    render(vista: string, locals: unknown) {
      capturada.vista = vista;
      capturada.locals = locals;
      return this;
    },
    send(cuerpo: unknown) {
      capturada.json = cuerpo;
      return this;
    },
    setHeader() {
      return this;
    },
  } as unknown as Response;
  return { res, capturada };
}

/** Parámetro `error` (o `msg`) de una redirección, ya decodificado. */
export function parametroRedireccion(url: string | undefined, clave: 'error' | 'msg'): string | null {
  if (!url) return null;
  return new URL(url, 'http://sahad.local').searchParams.get(clave);
}