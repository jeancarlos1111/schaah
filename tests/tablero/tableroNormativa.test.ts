import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import ejs from 'ejs';
import path from 'path';
import { DedicacionDocente, RolUsuario } from '../../src/core/domain/enums';
import { RESTRICCIONES_BLANDAS, RESTRICCIONES_DURAS } from '../../src/core/domain/rules/catalogoNormativa';
import { LIMITES_DEDICACION } from '../../src/core/domain/rules/dedicacionRules';
import { RAIZ_PROYECTO, crearBaseTemporal, sembrarPeriodoBase } from '../helpers/baseTemporal';
import { fabrica } from '../helpers/fabrica';
import { UsuarioSesion, peticion, respuesta } from '../helpers/peticiones';

const vista = (relativa: string) => path.join(RAIZ_PROYECTO, 'src/views/pages', relativa);

const base = crearBaseTemporal('sahad-tablero-normativa-');
const { tablero } = await import('../../src/modules/tablero/TableroController');
const { normativa, reportesDisponibles } = await import('../../src/modules/normativa/NormativaController');

describe('Catálogo de normativa (Spec 01, sección 4)', () => {
  it('lista las restricciones duras H-01 a H-10 y las blandas con su peso', () => {
    expect(RESTRICCIONES_DURAS.map((r) => r.codigo)).toEqual(
      ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'].map((n) => `H-${n}`)
    );
    expect(RESTRICCIONES_BLANDAS.map((r) => r.codigo)).toEqual(['S-01', 'S-02', 'S-03', 'S-04', 'S-05', 'S-06', 'S-07', 'S-08']);
    for (const r of [...RESTRICCIONES_DURAS, ...RESTRICCIONES_BLANDAS]) {
      expect(r.descripcion.length).toBeGreaterThan(30);
    }
    expect(RESTRICCIONES_BLANDAS.every((r) => typeof r.peso === 'number' && r.peso > 0)).toBe(true);
  });
});

describe('Reportes ofrecidos en Normativa según el rol', () => {
  const hrefs = (rol: RolUsuario, periodoId: string | null) => reportesDisponibles(rol, periodoId).map((r) => r.href);

  it('la planificación accede a la planilla consolidada, la oferta, las inconsistencias y la matriz del período', () => {
    expect(hrefs(RolUsuario.COORDINADOR_PFG, 'p1')).toEqual([
      '/docentes/carga-consolidada',
      '/periodos/p1/oferta/exportar.xlsx',
      '/periodos/p1/oferta/inconsistencias.xlsx',
      '/periodos/p1/horarios',
    ]);
  });

  it('el docente ve su horario, su disponibilidad y la oferta, nunca enlaces que le den 403', () => {
    expect(hrefs(RolUsuario.DOCENTE, 'p1')).toEqual(['/horarios', '/mi-disponibilidad', '/periodos/p1/oferta/exportar.xlsx']);
  });

  it('sin período abierto no ofrece exportaciones del período', () => {
    expect(hrefs(RolUsuario.ADMINISTRADOR, null)).toEqual(['/docentes/carga-consolidada']);
    expect(hrefs(RolUsuario.DOCENTE, null)).toEqual(['/horarios', '/mi-disponibilidad']);
  });

  it('cada reporte trae etiqueta e icono para su botón de acción', () => {
    for (const r of reportesDisponibles(RolUsuario.DIRECTOR_ACADEMICO, 'p1')) {
      expect(r.accion.length).toBeGreaterThan(0);
      expect(r.icono.length).toBeGreaterThan(0);
    }
  });
});

describe('Tablero y Normativa sobre el período vigente (controladores reales sobre SQLite)', () => {
  const ids = {} as Record<'vigente' | 'cerrado' | 'info', string>;
  let admin: UsuarioSesion;
  let coordinador: UsuarioSesion;
  let docente: UsuarioSesion;

  beforeAll(async () => {
    const f = fabrica(base.prisma);
    const semilla = await sembrarPeriodoBase(base.prisma);
    ids.vigente = semilla.periodoId;
    ids.info = semilla.pfgId;
    await base.prisma.periodoAcademico.update({
      where: { id: ids.vigente },
      data: { estado: 'PLANIFICACION', createdAt: new Date('2026-06-01') },
    });
    ids.cerrado = (
      await base.prisma.periodoAcademico.create({
        data: {
          codigo: '2026-I',
          nombre: 'Período 2026-I',
          estado: 'CERRADO',
          fechaInicio: new Date('2026-02-02'),
          fechaFin: new Date('2026-07-24'),
          createdAt: new Date('2026-09-01'),
        },
      })
    ).id;
    const arq = await base.prisma.programaFormacion.create({
      data: { codigo: 'ARQ', nombre: 'Arquitectura', areaConocimiento: 'Arquitectura' },
    });

    const carla = await f.profesor('Carla Méndez');
    const ruben = await f.profesor('Rubén Salas');
    const ana = await f.profesor('Ana Rivas');
    const tc = LIMITES_DEDICACION[DedicacionDocente.TIEMPO_COMPLETO];
    const dedicar = (profesorId: string, periodoId: string, dedicacion: DedicacionDocente) =>
      base.prisma.profesorDedicacion.create({
        data: {
          profesorId,
          periodoId,
          dedicacion,
          horasPermanenciaSemanales: tc.maxPermanencia,
          minHorasDocenciaDirecta: LIMITES_DEDICACION[dedicacion].minDocencia,
          maxHorasDocenciaDirecta: LIMITES_DEDICACION[dedicacion].maxDocencia,
          sedeAdscripcionPrincipalId: semilla.sedeId,
        },
      });
    await dedicar(carla.id, ids.vigente, DedicacionDocente.TIEMPO_COMPLETO);
    await dedicar(ruben.id, ids.vigente, DedicacionDocente.TIEMPO_COMPLETO);
    await dedicar(ana.id, ids.cerrado, DedicacionDocente.DEDICACION_EXCLUSIVA);

    const ucInfo = await f.unidad(ids.info, 'INF-101', 'Algorítmica');
    const ucArq = await f.unidad(arq.id, 'ARQ-101', 'Diseño I');
    const seccion = (periodoId: string, codigo: string, unidadId: string, profesorId: string | null, horas: number) =>
      f.seccion({ periodoId, unidadId, sedeId: semilla.sedeId, codigo, profesorId, horas });
    await seccion(ids.vigente, 'INF-101-01', ucInfo.id, carla.id, 10);
    await seccion(ids.vigente, 'INF-101-02', ucInfo.id, null, 4);
    await seccion(ids.vigente, 'ARQ-101-01', ucArq.id, carla.id, 6);
    await seccion(ids.vigente, 'ARQ-101-02', ucArq.id, ruben.id, 4);
    await seccion(ids.cerrado, 'INF-101-09', ucInfo.id, ana.id, 4);

    admin = await f.usuario('admin@ubv.edu.ve', RolUsuario.ADMINISTRADOR);
    coordinador = await f.usuario('coord.informatica@ubv.edu.ve', RolUsuario.COORDINADOR_PFG, [ids.info]);
    docente = await f.usuario('carla.mendez@ubv.edu.ve', RolUsuario.DOCENTE);
    docente.profesorId = carla.id;
  }, 120_000);

  afterAll(async () => {
    await base.cerrar();
  });

  it('el administrador ve las cifras del período en planificación, no las del período cerrado más reciente', async () => {
    const { res, capturada } = respuesta();
    await tablero(await peticion({ usuario: admin }), res);

    expect(capturada.vista).toBe('pages/dashboard');
    expect(capturada.locals.periodo.id).toBe(ids.vigente);
    expect(capturada.locals.metricas).toMatchObject({
      docentesTotales: 3,
      docentesExclusivos: 0,
      seccionesTotales: 4,
      seccionesAsignadas: 3,
      porcentajeAsignado: 75,
      sobrecargas: 1,
      deficits: 1,
      alertasSobrecarga: 2,
    });

    const html = await ejs.renderFile(vista('dashboard.ejs'), capturada.locals);
    expect(html).toContain('Período 2026-II');
    expect(html).toContain('1 sobrecargas (H-04) y 1 déficits (H-05) de carga docente');
    expect(html).toContain('href="/espacios"');
    expect(html).toContain('Matriz de Horarios');
  });

  it('el coordinador solo cuenta las secciones y desviaciones de sus programas', async () => {
    const { res, capturada } = respuesta();
    await tablero(await peticion({ usuario: coordinador }), res);
    expect(capturada.locals.metricas).toMatchObject({
      seccionesTotales: 2,
      seccionesAsignadas: 1,
      porcentajeAsignado: 50,
      sobrecargas: 1,
      deficits: 0,
      alertasSobrecarga: 1,
    });
  });

  it('el docente recibe accesos a su horario y a su disponibilidad, sin infraestructura', async () => {
    const { res, capturada } = respuesta();
    await tablero(await peticion({ usuario: docente }), res);
    expect(capturada.locals.esDocente).toBe(true);

    const html = await ejs.renderFile(vista('dashboard.ejs'), capturada.locals);
    expect(html).toContain('href="/mi-disponibilidad"');
    expect(html).toContain('Declarar disponibilidad');
    expect(html).toContain('Ver mi horario');
    expect(html).not.toContain('href="/espacios"');
    expect(html).not.toContain('href="/docentes"');
  });

  it('la página de Normativa muestra reglas, límites y bloques en 12 horas, con los reportes del período vigente', async () => {
    const { res, capturada } = respuesta();
    await normativa(await peticion({ usuario: coordinador }), res);
    expect(capturada.vista).toBe('pages/normativa/index');
    expect(capturada.locals.title).toBe('Normativa y Reportes');
    expect(capturada.locals.periodo.id).toBe(ids.vigente);

    const html = await ejs.renderFile(vista('normativa/index.ejs'), capturada.locals);
    for (const r of RESTRICCIONES_DURAS) expect(html).toContain(`<span class="email-code">${r.codigo}</span>`);
    expect(html).toContain('Tiempo Completo (TC)');
    expect(html).toContain('8 h – 12 h');
    expect(html).toContain('07:30 AM – 09:00 AM');
    expect(html).not.toMatch(/\b(1[3-9]|2[0-3]):[0-5]\d\b/);
    expect(html).toContain(`href="/periodos/${ids.vigente}/oferta/inconsistencias.xlsx"`);
    expect(html).toContain('href="/docentes/carga-consolidada"');
    expect(html).toMatch(/<span uk-icon="icon: download; ratio: 0.75"><\/span>\s*<span>Descargar<\/span>/);
    expect(html).not.toContain('style="');
  });

  it('para el docente la Normativa no enlaza planillas reservadas a la planificación', async () => {
    const { res, capturada } = respuesta();
    await normativa(await peticion({ usuario: docente }), res);
    const html = await ejs.renderFile(vista('normativa/index.ejs'), capturada.locals);
    expect(html).toContain('href="/mi-disponibilidad"');
    expect(html).not.toContain('/docentes/carga-consolidada');
    expect(html).not.toContain('inconsistencias.xlsx');
  });

  it('sin períodos abiertos el tablero lo indica y muestra cifras en cero', async () => {
    await base.prisma.periodoAcademico.update({ where: { id: ids.vigente }, data: { estado: 'CERRADO' } });
    const { res, capturada } = respuesta();
    await tablero(await peticion({ usuario: admin }), res);
    expect(capturada.locals.periodo).toBeNull();
    expect(capturada.locals.metricas.seccionesTotales).toBe(0);

    const html = await ejs.renderFile(vista('dashboard.ejs'), capturada.locals);
    expect(html).toContain('Sin período abierto');
  });
});
