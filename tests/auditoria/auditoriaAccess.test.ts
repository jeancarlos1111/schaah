import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RolUsuario } from '../../src/core/domain/enums';
import { crearBaseTemporal } from '../helpers/baseTemporal';
import { fabrica } from '../helpers/fabrica';
import { peticion, respuesta, UsuarioSesion } from '../helpers/peticiones';
import { requireRole } from '../../src/modules/auth/middlewares/authMiddleware';

const base = crearBaseTemporal('sahad-auditoria-test-');
const { AuditService } = await import('../../src/core/audit/auditService');
const { auditoriaController } = await import('../../src/modules/auditoria/controllers/AuditoriaController');

describe('Bitácora de Auditoría (Fase 1 - Exclusiva para Administrador)', () => {
  let admin: UsuarioSesion;
  let planificador: UsuarioSesion;
  let coordinador: UsuarioSesion;
  let docente: UsuarioSesion;

  beforeAll(async () => {
    const f = fabrica(base.prisma);
    admin = await f.usuario('admin.auditoria@ubv.edu.ve', RolUsuario.ADMINISTRADOR);
    planificador = await f.usuario('planificador.auditoria@ubv.edu.ve', RolUsuario.PLANIFICADOR);
    coordinador = await f.usuario('coord.auditoria@ubv.edu.ve', RolUsuario.COORDINADOR_PFG);
    docente = await f.usuario('docente.auditoria@ubv.edu.ve', RolUsuario.DOCENTE);
  }, 120_000);

  afterAll(async () => {
    await base.cerrar();
  });

  it('AuditService registra y lista eventos en base de datos real sin mocks', async () => {
    const evento = await AuditService.registrar({
      usuarioId: admin.id,
      usuarioEmail: admin.email,
      usuarioNombre: 'Admin Auditoria',
      rol: RolUsuario.ADMINISTRADOR,
      accion: 'CREAR',
      entidad: 'USUARIO',
      entidadId: 'usr-12345',
      detalles: 'Creación de cuenta de prueba',
      datosNuevos: { email: 'nuevo@ubv.edu.ve', rol: 'DOCENTE' },
      ip: '127.0.0.1',
    });

    expect(evento).toBeDefined();
    expect(evento?.accion).toBe('CREAR');
    expect(evento?.entidad).toBe('USUARIO');

    const listado = await AuditService.listar({ entidad: 'USUARIO', accion: 'CREAR' });
    expect(listado.total).toBeGreaterThanOrEqual(1);
    expect(listado.items.some((i) => i.entidadId === 'usr-12345')).toBe(true);
  });

  it('AuditoriaController.index renderiza la vista correctamente para el Administrador', async () => {
    const r = respuesta();
    const req = await peticion({ usuario: admin });
    await auditoriaController.index(req, r.res);

    expect(r.capturada.vista).toBe('pages/auditoria/index');
    expect(r.capturada.locals.title).toContain('Auditoría');
    expect(r.capturada.locals.items).toBeDefined();
    expect(r.capturada.locals.pagination).toBeDefined();
  });

  it('requireRole bloquea el acceso a la bitácora (403) para PLANIFICADOR, COORDINADOR y DOCENTE', async () => {
    const middleware = requireRole(RolUsuario.ADMINISTRADOR);

    for (const u of [planificador, coordinador, docente]) {
      const r = respuesta();
      let nextLlamado = false;
      const req = await peticion({ usuario: u });

      middleware(req, r.res, () => {
        nextLlamado = true;
      });

      expect(nextLlamado).toBe(false);
      expect(r.capturada.status).toBe(403);
    }
  });
});
