import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import ejs from 'ejs';
import path from 'path';
import { RolUsuario } from '../../src/core/domain/enums';
import {
  elegirPeriodoDisponibilidad,
  periodosParaDisponibilidad,
} from '../../src/core/domain/rules/periodoDisponibilidadRules';
import { RAIZ_PROYECTO, crearBaseTemporal, sembrarPeriodoBase } from '../helpers/baseTemporal';
import { fabrica } from '../helpers/fabrica';
import { UsuarioSesion, parametroRedireccion, peticion, respuesta } from '../helpers/peticiones';

const periodo = (id: string, estado: string, dia: number) => ({ id, estado, createdAt: new Date(2026, 0, dia) });

describe('Período de la matriz de disponibilidad (regla de dominio)', () => {
  const activoViejo = periodo('2025-II', 'ACTIVO', 1);
  const activo = periodo('2026-I', 'ACTIVO', 2);
  const planificacion = periodo('2026-II', 'PLANIFICACION', 3);
  const borrador = periodo('2027-I', 'BORRADOR', 4);
  const cerrado = periodo('2024-II', 'CERRADO', 5);

  it('excluye los cerrados y ordena primero los que se planifican, del más reciente al más antiguo', () => {
    expect(periodosParaDisponibilidad([activoViejo, cerrado, planificacion, activo, borrador]).map((p) => p.id)).toEqual([
      '2027-I',
      '2026-II',
      '2026-I',
      '2025-II',
    ]);
  });

  it('por defecto elige el período en planificación o borrador más reciente; sin ninguno, el activo más reciente', () => {
    expect(elegirPeriodoDisponibilidad([activo, planificacion, cerrado])?.id).toBe('2026-II');
    expect(elegirPeriodoDisponibilidad([activoViejo, activo, cerrado])?.id).toBe('2026-I');
    expect(elegirPeriodoDisponibilidad([cerrado])).toBeNull();
    expect(elegirPeriodoDisponibilidad([])).toBeNull();
  });

  it('respeta el período solicitado si está abierto y rechaza uno cerrado o inexistente', () => {
    const todos = [activo, planificacion, cerrado];
    expect(elegirPeriodoDisponibilidad(todos, '2026-I')?.id).toBe('2026-I');
    expect(elegirPeriodoDisponibilidad(todos, '2024-II')).toBeNull();
    expect(elegirPeriodoDisponibilidad(todos, 'no-existe')).toBeNull();
    expect(elegirPeriodoDisponibilidad(todos, '')?.id).toBe('2026-II');
  });
});

const base = crearBaseTemporal('sahad-disponibilidad-periodo-');
const { DocentesController } = await import('../../src/modules/docentes/controllers/DocentesController');
const controlador = new DocentesController();

describe('Matriz de disponibilidad con selector de período (controlador real sobre SQLite)', () => {
  const ids = {} as Record<'planificado' | 'activo' | 'cerrado' | 'carlos' | 'ana', string>;
  let docente: UsuarioSesion;
  let director: UsuarioSesion;

  const franja = { dia: 'LUNES', horaInicio: '07:30', horaFin: '09:00', prioridad: 1, disponible: true };
  const franjasDe = (profesorId: string, periodoId: string) =>
    base.prisma.profesorDisponibilidad.findMany({ where: { profesorId, periodoId } });

  beforeAll(async () => {
    const f = fabrica(base.prisma);
    ids.planificado = (await sembrarPeriodoBase(base.prisma)).periodoId;
    await base.prisma.periodoAcademico.update({
      where: { id: ids.planificado },
      data: { estado: 'PLANIFICACION', createdAt: new Date('2026-06-01') },
    });
    const crear = (codigo: string, estado: string, creado: string) =>
      base.prisma.periodoAcademico.create({
        data: {
          codigo,
          nombre: `Período ${codigo}`,
          estado,
          fechaInicio: new Date('2026-02-02'),
          fechaFin: new Date('2026-07-24'),
          createdAt: new Date(creado),
        },
      });
    ids.activo = (await crear('2026-I', 'ACTIVO', '2026-01-10')).id;
    ids.cerrado = (await crear('2025-II', 'CERRADO', '2026-09-01')).id;

    ids.carlos = (await f.profesor('Carlos Gómez')).id;
    ids.ana = (await f.profesor('Ana Rivas')).id;
    docente = await f.usuario('carlos.gomez@ubv.edu.ve', RolUsuario.DOCENTE);
    await base.prisma.usuario.update({ where: { id: docente.id }, data: { profesorId: ids.carlos } });
    docente.profesorId = ids.carlos;
    director = await f.usuario('director.academico@ubv.edu.ve', RolUsuario.DIRECTOR_ACADEMICO);
  }, 120_000);

  afterAll(async () => {
    await base.cerrar();
  });

  it('abre el período en planificación, lista solo los abiertos y adapta los enlaces al docente', async () => {
    const { res, capturada } = respuesta();
    await controlador.disponibilidad(await peticion({ usuario: docente, params: { id: ids.carlos } }), res);

    expect(capturada.vista).toBe('pages/docentes/disponibilidad');
    expect(capturada.locals.periodoActivo.id).toBe(ids.planificado);
    expect(capturada.locals.periodos.map((p: { codigo: string }) => p.codigo)).toEqual(['2026-II', '2026-I']);
    expect(capturada.locals.esDocente).toBe(true);
    expect(capturada.locals.error).toBeNull();

    const html = await ejs.renderFile(path.join(RAIZ_PROYECTO, 'src/views/pages/docentes/disponibilidad.ejs'), capturada.locals);
    expect(html).toContain(`<option value="${ids.planificado}" selected>`);
    expect(html).toContain('2026-I (Activo)');
    expect(html).not.toContain('2025-II');
    expect(html).toContain(`<input type="hidden" name="periodoId" value="${ids.planificado}">`);
    expect(html).toContain('Volver al Tablero');
    expect(html).not.toContain('href="/docentes"');
  });

  it('muestra el período elegido en el selector y avisa si se pide uno cerrado', async () => {
    const elegido = respuesta();
    await controlador.disponibilidad(
      await peticion({ usuario: director, params: { id: ids.ana }, query: { periodoId: ids.activo } }),
      elegido.res
    );
    expect(elegido.capturada.locals.periodoActivo.id).toBe(ids.activo);
    expect(elegido.capturada.locals.esDocente).toBe(false);

    const cerrado = respuesta();
    await controlador.disponibilidad(
      await peticion({ usuario: director, params: { id: ids.ana }, query: { periodoId: ids.cerrado } }),
      cerrado.res
    );
    expect(cerrado.capturada.locals.periodoActivo.id).toBe(ids.planificado);
    expect(cerrado.capturada.locals.error).toMatch(/no existe o está cerrado/);
  });

  it('guarda la disponibilidad solo en el período indicado y vuelve a él', async () => {
    const { res, capturada } = respuesta();
    await controlador.guardarDisponibilidad(
      await peticion({
        usuario: docente,
        params: { id: ids.carlos },
        body: { periodoId: ids.activo, slots: JSON.stringify([franja]) },
      }),
      res
    );

    expect(capturada.redirect).toContain(`periodoId=${ids.activo}`);
    expect(parametroRedireccion(capturada.redirect, 'msg')).toBe(
      'Disponibilidad del período 2026-I actualizada correctamente: 1 franja agregada.'
    );
    expect(await franjasDe(ids.carlos, ids.activo)).toHaveLength(1);
    expect(await franjasDe(ids.carlos, ids.planificado)).toHaveLength(0);
  });

  it('sin período en el formulario guarda en el período en planificación', async () => {
    const { res } = respuesta();
    await controlador.guardarDisponibilidad(
      await peticion({ usuario: docente, params: { id: ids.carlos }, body: { slots: JSON.stringify([franja, { ...franja, dia: 'MARTES' }]) } }),
      res
    );
    expect(await franjasDe(ids.carlos, ids.planificado)).toHaveLength(2);
    expect(await franjasDe(ids.carlos, ids.activo)).toHaveLength(1);
  });

  it('rechaza guardar en un período cerrado sin tocar los datos', async () => {
    const { res, capturada } = respuesta();
    await controlador.guardarDisponibilidad(
      await peticion({
        usuario: director,
        params: { id: ids.ana },
        body: { periodoId: ids.cerrado, slots: JSON.stringify([franja]), motivo: 'Reposo médico del docente' },
      }),
      res
    );
    expect(parametroRedireccion(capturada.redirect, 'error')).toBe('El período indicado no existe o está cerrado: no se guardaron cambios.');
    expect(await base.prisma.profesorDisponibilidad.count({ where: { profesorId: ids.ana } })).toBe(0);
  });

  it('un docente no puede ver ni modificar la disponibilidad de otro docente', async () => {
    const ver = respuesta();
    await controlador.disponibilidad(await peticion({ usuario: docente, params: { id: ids.ana } }), ver.res);
    expect(ver.capturada.status).toBe(403);
    expect(ver.capturada.vista).toBe('pages/error');

    const guardar = respuesta();
    await controlador.guardarDisponibilidad(
      await peticion({ usuario: docente, params: { id: ids.ana }, body: { slots: JSON.stringify([franja]) } }),
      guardar.res
    );
    expect(guardar.capturada.status).toBe(403);
    expect(guardar.capturada.redirect).toBeUndefined();
    expect(await base.prisma.profesorDisponibilidad.count({ where: { profesorId: ids.ana } })).toBe(0);
  });
});
