import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RolUsuario } from '../../src/core/domain/enums';
import { crearBaseTemporal, sembrarPeriodoBase } from '../helpers/baseTemporal';
import { fabrica } from '../helpers/fabrica';
import { UsuarioSesion, parametroRedireccion, peticion, respuesta } from '../helpers/peticiones';

const base = crearBaseTemporal('sahad-docente-periodos-');
const { PeriodosController, AVISO_DOCENTE_PERIODOS } = await import(
  '../../src/modules/periodos/controllers/PeriodosController'
);
const { HorariosController } = await import('../../src/modules/horarios/controllers/HorariosController');

describe('El docente no gestiona períodos ni secciones (controlador real sobre SQLite)', () => {
  const ids = {} as Record<'periodo' | 'carlos', string>;
  let docente: UsuarioSesion;
  let coordinador: UsuarioSesion;

  beforeAll(async () => {
    const f = fabrica(base.prisma);
    const semilla = await sembrarPeriodoBase(base.prisma);
    ids.periodo = semilla.periodoId;
    await base.prisma.periodoAcademico.update({ where: { id: ids.periodo }, data: { estado: 'ACTIVO' } });
    ids.carlos = (await f.profesor('Carlos Gómez')).id;
    docente = await f.usuario('carlos.gomez@ubv.edu.ve', RolUsuario.DOCENTE);
    await base.prisma.usuario.update({ where: { id: docente.id }, data: { profesorId: ids.carlos } });
    docente.profesorId = ids.carlos;
    coordinador = await f.usuario('coord.informatica@ubv.edu.ve', RolUsuario.COORDINADOR_PFG, [semilla.pfgId]);
  }, 120_000);

  afterAll(async () => {
    await base.cerrar();
  });

  it('/periodos lleva al docente a su horario con el aviso, que llega hasta la matriz', async () => {
    const listado = respuesta();
    await PeriodosController.index(await peticion({ usuario: docente }), listado.res);
    expect(listado.capturada.vista).toBeUndefined();
    expect(listado.capturada.redirect?.startsWith('/horarios?msg=')).toBe(true);
    expect(parametroRedireccion(listado.capturada.redirect, 'msg')).toBe(AVISO_DOCENTE_PERIODOS);

    const vigente = respuesta();
    await HorariosController.redirigirPeriodoActivo(
      await peticion({ usuario: docente, query: { msg: AVISO_DOCENTE_PERIODOS } }),
      vigente.res
    );
    expect(vigente.capturada.redirect?.startsWith(`/periodos/${ids.periodo}/horarios?msg=`)).toBe(true);

    const sinId = respuesta();
    await HorariosController.matriz(
      await peticion({ usuario: docente, params: { id: ids.periodo }, query: { msg: AVISO_DOCENTE_PERIODOS } }),
      sinId.res
    );
    expect(sinId.capturada.redirect).toContain(`tipo=DOCENTE&id=${ids.carlos}`);
    expect(parametroRedireccion(sinId.capturada.redirect, 'msg')).toBe(AVISO_DOCENTE_PERIODOS);

    const matriz = respuesta();
    await HorariosController.matriz(
      await peticion({
        usuario: docente,
        params: { id: ids.periodo },
        query: { tipo: 'DOCENTE', id: ids.carlos, msg: AVISO_DOCENTE_PERIODOS },
      }),
      matriz.res
    );
    expect(matriz.capturada.vista).toBe('pages/horarios/matriz');
    expect(matriz.capturada.locals.mensaje).toBe(AVISO_DOCENTE_PERIODOS);
  });

  it('/periodos/:id/secciones lleva al docente a la matriz de ese período', async () => {
    const { res, capturada } = respuesta();
    await PeriodosController.secciones(await peticion({ usuario: docente, params: { id: ids.periodo } }), res);
    expect(capturada.vista).toBeUndefined();
    expect(capturada.redirect?.startsWith(`/periodos/${ids.periodo}/horarios?msg=`)).toBe(true);
    expect(parametroRedireccion(capturada.redirect, 'msg')).toBe(AVISO_DOCENTE_PERIODOS);
  });

  it('un error recibido se conserva en lugar del aviso', async () => {
    const { res, capturada } = respuesta();
    await PeriodosController.index(
      await peticion({ usuario: docente, query: { error: 'Período académico no encontrado.' } }),
      res
    );
    expect(parametroRedireccion(capturada.redirect, 'error')).toBe('Período académico no encontrado.');
    expect(parametroRedireccion(capturada.redirect, 'msg')).toBeNull();
  });

  it('el coordinador sigue viendo el listado de períodos y las secciones', async () => {
    const listado = respuesta();
    await PeriodosController.index(await peticion({ usuario: coordinador }), listado.res);
    expect(listado.capturada.vista).toBe('pages/periodos/index');

    const secciones = respuesta();
    await PeriodosController.secciones(await peticion({ usuario: coordinador, params: { id: ids.periodo } }), secciones.res);
    expect(secciones.capturada.vista).toBe('pages/periodos/secciones');
  });
});
