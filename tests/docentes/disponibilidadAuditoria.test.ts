import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import ejs from 'ejs';
import path from 'path';
import { RolUsuario } from '../../src/core/domain/enums';
import { formatearFechaHora12 } from '../../src/core/domain/rules/timeSlotUtils';
import { RAIZ_PROYECTO, crearBaseTemporal, sembrarPeriodoBase } from '../helpers/baseTemporal';
import { fabrica } from '../helpers/fabrica';
import { UsuarioSesion, parametroRedireccion, peticion, respuesta } from '../helpers/peticiones';

const VISTA = path.join(RAIZ_PROYECTO, 'src/views/pages/docentes/disponibilidad.ejs');

const base = crearBaseTemporal('sahad-disponibilidad-auditoria-');
const { DocentesController } = await import('../../src/modules/docentes/controllers/DocentesController');
const controlador = new DocentesController();

describe('Disponibilidad auditada y coordinador acotado a sus programas (controlador real sobre SQLite)', () => {
  const ids = {} as Record<'periodo' | 'carlos' | 'ana' | 'luis', string>;
  let docente: UsuarioSesion;
  let director: UsuarioSesion;
  let coordinador: UsuarioSesion;

  const lunes = { dia: 'LUNES', horaInicio: '07:30', horaFin: '09:00', prioridad: 1, disponible: true };
  const martes = { dia: 'MARTES', horaInicio: '13:30', horaFin: '15:00', prioridad: 1, disponible: true };
  const auditorias = (profesorId: string) =>
    base.prisma.auditoriaDisponibilidad.findMany({ where: { profesorId }, orderBy: { fecha: 'asc' } });
  const franjas = (profesorId: string) =>
    base.prisma.profesorDisponibilidad.findMany({ where: { profesorId, periodoId: ids.periodo }, orderBy: { dia: 'asc' } });

  async function guardar(usuario: UsuarioSesion, profesorId: string, slots: object[], motivo?: string) {
    const { res, capturada } = respuesta();
    await controlador.guardarDisponibilidad(
      await peticion({
        usuario,
        params: { id: profesorId },
        body: { periodoId: ids.periodo, slots: JSON.stringify(slots), ...(motivo === undefined ? {} : { motivo }) },
      }),
      res
    );
    return capturada;
  }

  async function abrir(usuario: UsuarioSesion, profesorId: string) {
    const { res, capturada } = respuesta();
    await controlador.disponibilidad(await peticion({ usuario, params: { id: profesorId } }), res);
    return capturada;
  }

  beforeAll(async () => {
    const f = fabrica(base.prisma);
    const semilla = await sembrarPeriodoBase(base.prisma);
    ids.periodo = semilla.periodoId;
    const salud = await base.prisma.programaFormacion.create({
      data: { codigo: 'PFG-SALUD', nombre: 'Medicina Integral Comunitaria', areaConocimiento: 'Salud' },
    });

    ids.carlos = (await f.profesor('Carlos Gómez')).id;
    ids.ana = (await f.profesor('Ana Rivas')).id;
    ids.luis = (await f.profesor('Luis Pérez')).id;
    const informatica = await f.unidad(semilla.pfgId, 'INF-101', 'Algorítmica y Programación');
    const anatomia = await f.unidad(salud.id, 'MIC-101', 'Morfofisiología');
    await f.seccion({ periodoId: ids.periodo, unidadId: informatica.id, sedeId: semilla.sedeId, codigo: 'INF-101-01', profesorId: ids.carlos });
    await f.seccion({ periodoId: ids.periodo, unidadId: anatomia.id, sedeId: semilla.sedeId, codigo: 'MIC-101-01', profesorId: ids.ana });

    docente = await f.usuario('carlos.gomez@ubv.edu.ve', RolUsuario.DOCENTE);
    await base.prisma.usuario.update({ where: { id: docente.id }, data: { profesorId: ids.carlos } });
    docente.profesorId = ids.carlos;
    director = await f.usuario('director.academico@ubv.edu.ve', RolUsuario.DIRECTOR_ACADEMICO);
    coordinador = await f.usuario('coord.informatica@ubv.edu.ve', RolUsuario.COORDINADOR_PFG, [semilla.pfgId]);
  }, 120_000);

  afterAll(async () => {
    await base.cerrar();
  });

  it('el director no puede guardar la disponibilidad de otro docente sin motivo y no se toca nada', async () => {
    const capturada = await guardar(director, ids.ana, [lunes], 'urgente');
    expect(parametroRedireccion(capturada.redirect, 'error')).toBe(
      'Indique el motivo del cambio (al menos 10 caracteres): no se guardaron cambios.'
    );
    expect(capturada.redirect).toContain(`/docentes/${ids.ana}/disponibilidad?periodoId=${ids.periodo}`);
    expect(await franjas(ids.ana)).toHaveLength(0);
    expect(await auditorias(ids.ana)).toHaveLength(0);
  });

  it('con motivo guarda las franjas y deja el registro auditable con responsable, rol, motivo y datos', async () => {
    const capturada = await guardar(director, ids.ana, [lunes, martes], '  Reposo médico:   el docente llamó por teléfono ');
    expect(parametroRedireccion(capturada.redirect, 'msg')).toBe(
      'Disponibilidad del período 2026-II actualizada correctamente: 2 franjas agregadas.'
    );
    expect((await franjas(ids.ana)).map((d) => d.dia)).toEqual(['LUNES', 'MARTES']);

    const [registro] = await auditorias(ids.ana);
    expect(registro).toMatchObject({
      periodoId: ids.periodo,
      usuarioResponsable: 'director.academico@ubv.edu.ve',
      rolResponsable: RolUsuario.DIRECTOR_ACADEMICO,
      resumen: '2 franjas agregadas',
      motivo: 'Reposo médico: el docente llamó por teléfono',
    });
    expect(JSON.parse(registro.datosAnteriores!)).toEqual([]);
    expect(JSON.parse(registro.datosNuevos!)).toEqual([
      { dia: 'LUNES', horaInicio: '07:30', horaFin: '09:00', prioridad: 1 },
      { dia: 'MARTES', horaInicio: '13:30', horaFin: '15:00', prioridad: 1 },
    ]);
  });

  it('el propio docente guarda sin motivo; repetir lo mismo no registra nada', async () => {
    const primera = await guardar(docente, ids.carlos, [lunes]);
    expect(parametroRedireccion(primera.redirect, 'msg')).toMatch(/actualizada correctamente: 1 franja agregada\.$/);
    const [registro] = await auditorias(ids.carlos);
    expect(registro).toMatchObject({ usuarioResponsable: 'carlos.gomez@ubv.edu.ve', rolResponsable: RolUsuario.DOCENTE, motivo: null });

    const repetida = await guardar(docente, ids.carlos, [lunes]);
    expect(parametroRedireccion(repetida.redirect, 'msg')).toBe(
      'Sin cambios en la disponibilidad del período 2026-II: no se registró nada.'
    );
    expect(await auditorias(ids.carlos)).toHaveLength(1);
  });

  it('registra quitas y cambios de prioridad con el estado anterior completo', async () => {
    await guardar(director, ids.ana, [{ ...lunes, prioridad: 3 }], 'Ajuste por cambio de sede del docente');
    const registros = await auditorias(ids.ana);
    expect(registros).toHaveLength(2);
    expect(registros[1].resumen).toBe('1 franja quitada, 1 cambio de prioridad');
    expect(JSON.parse(registros[1].datosAnteriores!)).toHaveLength(2);
    expect((await franjas(ids.ana)).map((d) => [d.dia, d.prioridadPreferencia])).toEqual([['LUNES', 3]]);
  });

  it('la vista pide el motivo a terceros y muestra el historial con fecha de 12 horas', async () => {
    const capturada = await abrir(director, ids.ana);
    expect(capturada.locals.requiereMotivo).toBe(true);
    expect(capturada.locals.historial.map((h: { resumen: string }) => h.resumen)).toEqual([
      '1 franja quitada, 1 cambio de prioridad',
      '2 franjas agregadas',
    ]);
    const [ultimo] = capturada.locals.historial;
    const registro = (await auditorias(ids.ana))[1];
    expect(ultimo.fecha).toBe(formatearFechaHora12(registro.fecha));
    expect(ultimo.fecha).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2} (AM|PM)$/);
    expect(ultimo).toMatchObject({
      responsable: 'director academico',
      rol: 'Planificador',
      quitadas: ['MARTES 01:30 PM'],
      cambiosPrioridad: ['LUNES 07:30 AM (P1 a P3)'],
    });

    const html = await ejs.renderFile(VISTA, capturada.locals);
    expect(html).toMatch(/<textarea id="disp-motivo" name="motivo" class="form-input-clean" required\s+minlength="10"/);
    expect(html).toContain('Historial de cambios (2026-II)');
    expect(html).toContain(ultimo.fecha);
    expect(html).toContain('Ajuste por cambio de sede del docente');
    expect(html).toContain('Quitadas: MARTES 01:30 PM');
  });

  it('al propio docente no se le pide motivo y su historial lo identifica como registrado por él', async () => {
    const capturada = await abrir(docente, ids.carlos);
    expect(capturada.locals.requiereMotivo).toBe(false);
    const html = await ejs.renderFile(VISTA, capturada.locals);
    expect(html).not.toContain('name="motivo"');
    expect(html).toContain('Registrado por el propio docente');
  });

  it('el coordinador edita la disponibilidad de los docentes de sus programas, con motivo', async () => {
    const vista = await abrir(coordinador, ids.carlos);
    expect(vista.vista).toBe('pages/docentes/disponibilidad');
    expect(vista.locals.requiereMotivo).toBe(true);

    const capturada = await guardar(coordinador, ids.carlos, [lunes, martes], 'El docente está en una jornada fuera de la sede');
    expect(parametroRedireccion(capturada.redirect, 'msg')).toMatch(/1 franja agregada\.$/);
    const ultimo = (await auditorias(ids.carlos)).at(-1)!;
    expect(ultimo).toMatchObject({ usuarioResponsable: 'coord.informatica@ubv.edu.ve', rolResponsable: RolUsuario.COORDINADOR_PFG });
  });

  it('el coordinador no ve ni modifica la de docentes sin asignaciones de sus programas', async () => {
    for (const profesorId of [ids.ana, ids.luis]) {
      const vista = await abrir(coordinador, profesorId);
      expect(vista.status).toBe(403);
      expect(vista.locals.statusCode).toBe(403);
      expect(vista.locals.mensaje).toMatch(/docentes con asignaciones de sus programas/);

      const capturada = await guardar(coordinador, profesorId, [lunes], 'Intento fuera de su programa');
      expect(capturada.status).toBe(403);
      expect(capturada.redirect).toBeUndefined();
    }
    expect(await franjas(ids.luis)).toHaveLength(0);
    expect(await auditorias(ids.luis)).toHaveLength(0);
    expect((await franjas(ids.ana)).map((d) => d.prioridadPreferencia)).toEqual([3]);
  });

  it('en la nómina, el botón Disponibilidad solo aparece en los docentes que el coordinador puede editar', async () => {
    const delCoordinador = respuesta();
    await controlador.index(await peticion({ usuario: coordinador }), delCoordinador.res);
    expect(delCoordinador.capturada.locals.disponibilidadEditable).toEqual([ids.carlos]);

    const html = await ejs.renderFile(path.join(RAIZ_PROYECTO, 'src/views/pages/docentes/index.ejs'), {
      ...delCoordinador.capturada.locals,
      usuario: coordinador,
    });
    expect(html).toContain('Rivas, Ana');
    expect(html).toContain('Pérez, Luis');
    expect(html).toContain(`href="/docentes/${ids.carlos}/disponibilidad"`);
    expect(html).not.toContain(`href="/docentes/${ids.ana}/disponibilidad"`);
    expect(html).not.toContain(`href="/docentes/${ids.luis}/disponibilidad"`);

    const delDirector = respuesta();
    await controlador.index(await peticion({ usuario: director }), delDirector.res);
    expect(delDirector.capturada.locals.disponibilidadEditable).toBeNull();
  });
});
