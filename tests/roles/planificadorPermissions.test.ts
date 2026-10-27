import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RolUsuario } from '../../src/core/domain/enums';
import { crearBaseTemporal } from '../helpers/baseTemporal';
import { fabrica } from '../helpers/fabrica';
import { peticion, respuesta, UsuarioSesion } from '../helpers/peticiones';
import { requireRole } from '../../src/modules/auth/middlewares/authMiddleware';

const raiz = join(__dirname, '../..');

const base = crearBaseTemporal('sahad-planificador-roles-');

describe('Permisos y límites del rol PLANIFICADOR (Fase 1)', () => {
  let planificador: UsuarioSesion;

  beforeAll(async () => {
    const f = fabrica(base.prisma);
    planificador = await f.usuario('planificador.perm@ubv.edu.ve', RolUsuario.PLANIFICADOR);
  }, 120_000);

  afterAll(async () => {
    await base.cerrar();
  });

  it('PLANIFICADOR es admitido en rutas de espacios, períodos y currículo', async () => {
    const middlewareEspacios = requireRole(RolUsuario.ADMINISTRADOR, RolUsuario.PLANIFICADOR);
    const middlewarePeriodos = requireRole([RolUsuario.ADMINISTRADOR, RolUsuario.PLANIFICADOR]);
    const middlewareCurriculo = requireRole(RolUsuario.ADMINISTRADOR, RolUsuario.PLANIFICADOR, RolUsuario.COORDINADOR_PFG);

    for (const mw of [middlewareEspacios, middlewarePeriodos, middlewareCurriculo]) {
      const r = respuesta();
      let nextLlamado = false;
      const req = await peticion({ usuario: planificador });

      mw(req, r.res, () => {
        nextLlamado = true;
      });

      expect(nextLlamado).toBe(true);
      expect(r.capturada.status).toBe(200);
    }
  });

  it('PLANIFICADOR es rechazado con 403 en gestión de usuarios y roles', async () => {
    const middlewareUsuarios = requireRole(RolUsuario.ADMINISTRADOR);

    const r = respuesta();
    let nextLlamado = false;
    const req = await peticion({ usuario: planificador });

    middlewareUsuarios(req, r.res, () => {
      nextLlamado = true;
    });

    expect(nextLlamado).toBe(false);
    expect(r.capturada.status).toBe(403);
  });

  it('PLANIFICADOR es rechazado con 403 en operaciones de activar/desactivar (toggles)', async () => {
    // Toggles de recintos, sedes, docentes, pfg y unidades curriculares exigen exclusivamente ADMINISTRADOR
    const middlewareToggles = requireRole(RolUsuario.ADMINISTRADOR);

    const r = respuesta();
    let nextLlamado = false;
    const req = await peticion({ usuario: planificador });

    middlewareToggles(req, r.res, () => {
      nextLlamado = true;
    });

    expect(nextLlamado).toBe(false);
    expect(r.capturada.status).toBe(403);
  });

  it('las vistas de docentes y currículo ocultan Suspender/Activar salvo ADMINISTRADOR', () => {
    const docentes = readFileSync(join(raiz, 'src/views/pages/docentes/index.ejs'), 'utf8');
    const curriculo = readFileSync(join(raiz, 'src/views/pages/curriculo/index.ejs'), 'utf8');

    const bloqueToggleDocente = docentes.match(
      /<% if \(usuario && usuario\.rol === 'ADMINISTRADOR'\) \{ %>[\s\S]*?\/docentes\/<%= p\.id %>\/toggle[\s\S]*?Suspender[\s\S]*?<% \} %>/
    );
    expect(bloqueToggleDocente).not.toBeNull();

    const bloqueToggleUc = curriculo.match(
      /<% if \(usuario && usuario\.rol === 'ADMINISTRADOR'\) \{ %>[\s\S]*?\/curriculo\/unidades\/<%= uc\.id %>\/toggle[\s\S]*?<% \} %>/
    );
    const bloqueTogglePfg = curriculo.match(
      /<% if \(usuario && usuario\.rol === 'ADMINISTRADOR'\) \{ %>[\s\S]*?\/curriculo\/pfg\/<%= pfgSeleccionado\.id %>\/toggle[\s\S]*?<% \} %>/
    );
    expect(bloqueToggleUc).not.toBeNull();
    expect(bloqueTogglePfg).not.toBeNull();
  });
});
