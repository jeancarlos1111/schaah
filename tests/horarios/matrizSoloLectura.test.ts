import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import ejs from 'ejs';
import { readFileSync } from 'fs';
import path from 'path';
import { RolUsuario } from '../../src/core/domain/enums';
import { ROLES_PROGRAMACION_HORARIOS, puedeProgramarHorarios } from '../../src/core/domain/rules/alcancePfgRules';
import { RAIZ_PROYECTO, crearBaseTemporal, sembrarPeriodoBase } from '../helpers/baseTemporal';
import { fabrica } from '../helpers/fabrica';
import { UsuarioSesion, parametroRedireccion, peticion, respuesta } from '../helpers/peticiones';

const VISTA_MATRIZ = path.join(RAIZ_PROYECTO, 'src/views/pages/horarios/matriz.ejs');

describe('Roles que programan horarios (Spec 06 y Fase 3)', () => {
  it('administrador y planificador programan espacios/horarios; coordinador y docente consultan en modo lectura', () => {
    expect(ROLES_PROGRAMACION_HORARIOS).toEqual([
      RolUsuario.ADMINISTRADOR,
      RolUsuario.PLANIFICADOR,
    ]);
    expect(puedeProgramarHorarios(RolUsuario.ADMINISTRADOR)).toBe(true);
    expect(puedeProgramarHorarios(RolUsuario.PLANIFICADOR)).toBe(true);
    expect(puedeProgramarHorarios(RolUsuario.COORDINADOR_PFG)).toBe(false);
    expect(puedeProgramarHorarios(RolUsuario.DOCENTE)).toBe(false);
    expect(puedeProgramarHorarios(undefined)).toBe(false);
  });
});

const base = crearBaseTemporal('sahad-matriz-solo-lectura-');
const { HorariosController } = await import('../../src/modules/horarios/controllers/HorariosController');

describe('Matriz de horarios según el rol (controlador real sobre SQLite)', () => {
  const ids = {} as Record<'periodo' | 'pfg' | 'carlos' | 'ana' | 'aula' | 'seccion', string>;
  let docente: UsuarioSesion;
  let docenteSinFicha: UsuarioSesion;
  let director: UsuarioSesion;

  async function abrirMatriz(usuario: UsuarioSesion, query: Record<string, string> = {}) {
    const { res, capturada } = respuesta();
    await HorariosController.matriz(await peticion({ usuario, params: { id: ids.periodo }, query }), res);
    return capturada;
  }

  beforeAll(async () => {
    const f = fabrica(base.prisma);
    const semilla = await sembrarPeriodoBase(base.prisma);
    ids.periodo = semilla.periodoId;
    ids.pfg = semilla.pfgId;
    ids.carlos = (await f.profesor('Carlos Gómez')).id;
    ids.ana = (await f.profesor('Ana Rivas')).id;
    ids.aula = (await f.aula(semilla.sedeId, 'Aula 101', 35)).id;
    const unidad = await f.unidad(semilla.pfgId, 'INF-101', 'Algorítmica y Programación');
    ids.seccion = (await f.seccion({ periodoId: ids.periodo, unidadId: unidad.id, sedeId: semilla.sedeId, codigo: 'INF-101-01', profesorId: ids.carlos })).id;
    await base.prisma.horarioSeccion.create({
      data: { seccionId: ids.seccion, espacioFisicoId: ids.aula, dia: 'LUNES', horaInicio: '07:30', horaFin: '09:00' },
    });

    docente = await f.usuario('carlos.gomez@ubv.edu.ve', RolUsuario.DOCENTE);
    await base.prisma.usuario.update({ where: { id: docente.id }, data: { profesorId: ids.carlos } });
    docente.profesorId = ids.carlos;
    docenteSinFicha = await f.usuario('invitado.docente@ubv.edu.ve', RolUsuario.DOCENTE);
    director = await f.usuario('director.academico@ubv.edu.ve', RolUsuario.DIRECTOR_ACADEMICO);
  }, 120_000);

  afterAll(async () => {
    await base.cerrar();
  });

  it('el docente que entra sin perspectiva abre su propio horario y no el del primer docente de la lista', async () => {
    const { res, capturada } = respuesta();
    await HorariosController.matriz(await peticion({ usuario: docente, params: { id: ids.periodo } }), res);
    expect(capturada.redirect).toBe(`/periodos/${ids.periodo}/horarios?tipo=DOCENTE&id=${ids.carlos}`);
  });

  it('el docente ve la matriz en solo consulta: sin optimizador, sin arrastre y con el código de la sección', async () => {
    const { res, capturada } = respuesta();
    await HorariosController.matriz(
      await peticion({ usuario: docente, params: { id: ids.periodo }, query: { tipo: 'DOCENTE', id: ids.carlos } }),
      res
    );
    expect(capturada.vista).toBe('pages/horarios/matriz');
    expect(capturada.locals.soloLectura).toBe(true);
    expect(capturada.locals.matrizMap.LUNES['07:30'].editable).toBe(false);

    const html = await ejs.renderFile(VISTA_MATRIZ, capturada.locals);
    expect(html).toContain('Consulta del horario semanal publicado');
    expect(html).toContain('<span class="seccion-code font-bold text-xs">INF-101-01</span>');
    expect(html).toContain('Descargar Horario PDF');
    expect(html).not.toContain('Optimizar Vacantes');
    expect(html).not.toContain('draggable="true"');
    expect(html).not.toContain('btn-delete-slot');
    expect(html).not.toContain('Arrastrar aquí');
    expect(html).not.toContain('id="modal-solver"');
    expect(html).not.toContain('href="/periodos"');
    expect(html).toContain('<a href="/" class="uk-link-reset uk-text-muted">Tablero</a>');
  });

  it('el docente solo ve su horario: sin pestañas de perspectiva, sin selector de docente ni filtro de programa', async () => {
    const capturada = await abrirMatriz(docente, { tipo: 'DOCENTE', id: ids.carlos });
    expect(capturada.locals.soloSuHorario).toBe(true);
    expect(capturada.locals.profesores.map((p: { id: string }) => p.id)).toEqual([ids.carlos]);
    expect(capturada.locals.entidadSeleccionadaNombre).toBe('Prof. Carlos Gómez');

    const html = await ejs.renderFile(VISTA_MATRIZ, capturada.locals);
    expect(html).not.toContain('Por Aula Física');
    expect(html).not.toContain('Por Sección (Cohorte)');
    expect(html).not.toContain('id="select-entidad"');
    expect(html).not.toContain('id="select-pfg"');
    expect(html).not.toContain('Rivas');
  });

  it('si el docente pide otra perspectiva u otro docente vuelve a su horario con un aviso', async () => {
    const propio = `/periodos/${ids.periodo}/horarios?tipo=DOCENTE&id=${ids.carlos}`;
    for (const query of [
      { tipo: 'AULA', id: ids.aula },
      { tipo: 'SECCION', id: ids.seccion },
      { tipo: 'GRUPO' },
      { tipo: 'DOCENTE', id: ids.ana },
    ]) {
      const capturada = await abrirMatriz(docente, query);
      expect(capturada.vista).toBeUndefined();
      expect(capturada.redirect?.startsWith(`${propio}&error=`)).toBe(true);
      expect(parametroRedireccion(capturada.redirect, 'error')).toBe('Solo puede consultar su propio horario.');
    }
  });

  it('el filtro de programa se descarta para el docente y los avisos recibidos se conservan', async () => {
    const conPfg = await abrirMatriz(docente, { tipo: 'DOCENTE', id: ids.carlos, pfgId: ids.pfg });
    expect(conPfg.redirect).toBe(`/periodos/${ids.periodo}/horarios?tipo=DOCENTE&id=${ids.carlos}`);

    const conAviso = await abrirMatriz(docente, { msg: 'Aviso de prueba' });
    expect(parametroRedireccion(conAviso.redirect, 'msg')).toBe('Aviso de prueba');
    expect(conAviso.redirect).toContain(`tipo=DOCENTE&id=${ids.carlos}`);
  });

  it('una cuenta docente sin ficha vinculada recibe una página de error en lugar del horario de otro', async () => {
    const capturada = await abrirMatriz(docenteSinFicha);
    expect(capturada.status).toBe(403);
    expect(capturada.vista).toBe('pages/error');
    expect(capturada.locals.statusCode).toBe(403);
    expect(capturada.locals.mensaje).toMatch(/no está vinculada a una ficha docente/);
    expect(capturada.redirect).toBeUndefined();
  });

  it('el director conserva el optimizador, el arrastre y la desasignación', async () => {
    const { res, capturada } = respuesta();
    await HorariosController.matriz(
      await peticion({ usuario: director, params: { id: ids.periodo }, query: { tipo: 'DOCENTE', id: ids.carlos } }),
      res
    );
    expect(capturada.locals.soloLectura).toBe(false);
    expect(capturada.locals.matrizMap.LUNES['07:30'].editable).toBe(true);

    const html = await ejs.renderFile(VISTA_MATRIZ, capturada.locals);
    expect(html).toContain('Optimizar Vacantes');
    expect(html).toContain('draggable="true"');
    expect(html).toContain('btn-delete-slot');
    expect(html).toContain('id="modal-solver"');
    expect(html).toMatch(/<span class="seccion-code[^"]*"[^>]*>INF-101-01<\/span>/);
    expect(html).toContain('Por Aula Física');
    expect(html).toContain('id="select-entidad"');
    expect(html).toContain('id="select-pfg"');
    expect(capturada.locals.profesores).toHaveLength(2);
  });

  it('el título de la perspectiva de aula no repite la palabra "Aula"', async () => {
    const { res, capturada } = respuesta();
    await HorariosController.matriz(
      await peticion({ usuario: director, params: { id: ids.periodo }, query: { tipo: 'AULA', id: ids.aula } }),
      res
    );
    expect(capturada.locals.entidadSeleccionadaNombre).toBe('Aula 101 (Los Chaguaramos)');
  });

  it('la exportación a PDF lee el código de la sección con el mismo selector que usan las tarjetas', () => {
    const plantilla = readFileSync(VISTA_MATRIZ, 'utf8');
    expect(plantilla).toContain("card.querySelector('.seccion-code')");
    const tarjetas = plantilla.match(/<span class="seccion-code[^"]*"[^>]*><%= bloqueData\.codigoSeccion %><\/span>/g) ?? [];
    expect(tarjetas).toHaveLength(3);
  });

  it('el coordinador consulta la matriz en modo solo lectura (asignación de espacios es potestad de planificador)', async () => {
    const f = fabrica(base.prisma);
    const coordinador = await f.usuario('coord.info@ubv.edu.ve', RolUsuario.COORDINADOR_PFG);
    const capturada = await abrirMatriz(coordinador, { tipo: 'DOCENTE', id: ids.carlos });
    expect(capturada.locals.soloLectura).toBe(true);
    expect(capturada.locals.matrizMap.LUNES['07:30'].editable).toBe(false);

    const html = await ejs.renderFile(VISTA_MATRIZ, capturada.locals);
    expect(html).not.toContain('Optimizar Vacantes');
    expect(html).not.toContain('id="modal-solver"');
    expect(html).not.toContain('draggable="true"');
  });
});
