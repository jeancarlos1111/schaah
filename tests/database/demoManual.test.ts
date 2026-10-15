import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, writeFileSync } from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import {
  DestinoDemoInvalidoError,
  RUTA_BASE_DEMO,
  copiarBaseDemo,
  rutaSqlite,
  sembrarDemoManual,
  verificarDestinoDemo,
} from '../../src/core/database/demoManual';
import { DedicacionDocente, RolUsuario, Turno } from '../../src/core/domain/enums';
import { LIMITES_DEDICACION } from '../../src/core/domain/rules/dedicacionRules';
import { BaseTemporal, RAIZ_PROYECTO, crearBaseTemporal, sembrarPeriodoBase } from '../helpers/baseTemporal';
import { fabrica } from '../helpers/fabrica';

const PRISMA_DIR = path.join(RAIZ_PROYECTO, 'prisma');

describe('Base de demostración del manual: protección del destino', () => {
  it('resuelve las URL relativas desde prisma/, como Prisma, y descarta los parámetros', () => {
    expect(rutaSqlite('file:./demo-manual.db')).toBe(path.join(PRISMA_DIR, 'demo-manual.db'));
    expect(rutaSqlite('file:demo-manual.db?connection_limit=1')).toBe(path.join(PRISMA_DIR, 'demo-manual.db'));
    expect(rutaSqlite('file:/tmp/sahad/demo.db')).toBe('/tmp/sahad/demo.db');
    expect(RUTA_BASE_DEMO).toBe(path.join(PRISMA_DIR, 'demo-manual.db'));
  });

  it('rechaza bases que no son SQLite', () => {
    expect(() => verificarDestinoDemo('postgresql://u:p@localhost/sahad')).toThrow(DestinoDemoInvalidoError);
  });

  it('nunca escribe sobre la base de trabajo dev.db, se indique como se indique', () => {
    for (const url of ['file:./dev.db', 'file:dev.db', `file:${path.join(PRISMA_DIR, 'dev.db')}`, 'file:/otra/ruta/dev.db']) {
      expect(() => verificarDestinoDemo(url), url).toThrow(DestinoDemoInvalidoError);
    }
  });

  it('rechaza un destino igual a la base de origen aunque una ruta sea relativa y la otra absoluta', () => {
    expect(() => verificarDestinoDemo('file:./copia.db', `file:${path.join(PRISMA_DIR, 'copia.db')}`)).toThrow(
      /misma base de origen/
    );
  });

  it('acepta el destino por defecto y devuelve su ruta absoluta', () => {
    expect(verificarDestinoDemo(`file:${RUTA_BASE_DEMO}`, 'file:./dev.db')).toBe(RUTA_BASE_DEMO);
  });
});

describe('Base de demostración del manual: copia y siembra sobre SQLite real', () => {
  let base: BaseTemporal;
  let prisma: PrismaClient;
  const ids = {} as {
    sedeId: string;
    periodoId: string;
    pfgId: string;
    agroId: string;
    ana: string;
    luis: string;
    carlos: string;
    pedro: string;
  };

  beforeAll(async () => {
    base = crearBaseTemporal('sahad-demo-manual-');
    prisma = base.prisma;
    const f = fabrica(prisma);
    Object.assign(ids, await sembrarPeriodoBase(prisma));
    ids.agroId = (
      await prisma.programaFormacion.create({ data: { codigo: 'PFG-AGRO', nombre: 'Agroecología', areaConocimiento: 'Agro' } })
    ).id;
    ids.ana = (await f.profesor('Ana Rivas')).id;
    ids.luis = (await f.profesor('Luis Mora')).id;
    ids.carlos = (await f.profesor('Carlos Gómez')).id;
    ids.pedro = (await f.profesor('Pedro Salas')).id;
    await prisma.usuario.create({
      data: {
        email: 'carlos.gomez@ubv.edu.ve',
        passwordHash: 'sin-uso-en-pruebas',
        nombres: 'Carlos',
        apellidos: 'Gómez',
        rol: RolUsuario.DOCENTE,
        profesorId: ids.carlos,
      },
    });
    await f.aula(ids.sedeId, 'Aula 101', 40, 'AUL-101');

    const uc = await f.unidad(ids.pfgId, 'INF-100', 'Algorítmica');
    const ucAgro = await f.unidad(ids.agroId, 'AGR-100', 'Suelos');
    const seccion = (codigo: string, profesorId: string | null, pfgUc = uc.id) =>
      f.seccion({ periodoId: ids.periodoId, unidadId: pfgUc, sedeId: ids.sedeId, codigo, profesorId, horas: 12 });
    await seccion('INF-A01', ids.ana);
    const vespertina = await seccion('INF-A02', ids.luis);
    await prisma.seccion.update({ where: { id: vespertina.id }, data: { turno: Turno.VESPERTINO } });
    await seccion('INF-A03', null);
    await seccion('INF-A04', ids.ana);
    await seccion('INF-A05', ids.luis);
    await seccion('AGR-A00', null, ucAgro.id);
    await seccion('AGR-A01', ids.pedro, ucAgro.id);

    await prisma.profesorDisponibilidad.create({
      data: {
        profesorId: ids.ana,
        periodoId: ids.periodoId,
        dia: 'DOMINGO',
        horaInicio: '07:30',
        horaFin: '09:00',
        prioridadPreferencia: 3,
        disponible: false,
      },
    });
  }, 120_000);

  afterAll(async () => {
    await base?.cerrar();
  });

  it('la copia con VACUUM INTO reemplaza un destino previo y conserva los datos del origen', async () => {
    const destino = path.join(base.directorio, 'demo-manual.db');
    writeFileSync(destino, 'contenido viejo que no es SQLite');
    writeFileSync(`${destino}-wal`, 'wal huérfano');

    await copiarBaseDemo(prisma, destino);

    expect(existsSync(`${destino}-wal`)).toBe(false);
    const copia = new PrismaClient({ datasourceUrl: `file:${destino}` });
    try {
      expect(await copia.seccion.count()).toBe(7);
      expect((await copia.usuario.findFirstOrThrow()).email).toBe('carlos.gomez@ubv.edu.ve');
    } finally {
      await copia.$disconnect();
    }
  });

  it('siembra disponibilidad, asigna la vacante al docente de prueba y completa las aulas del programa', async () => {
    const resumen = await sembrarDemoManual(prisma);

    expect(resumen).toEqual({
      periodoId: ids.periodoId,
      seccionesPfg: 5,
      docentesConDisponibilidad: 3,
      franjasCreadas: 6 * 3 + 6 * 6 + 6 * 3,
      aulasAgregadas: 1,
      seccionDocente: 'INF-A03',
    });

    const asignada = await prisma.seccion.findFirstOrThrow({ where: { codigoSeccion: 'INF-A03' } });
    expect(asignada.profesorId).toBe(ids.carlos);
    expect((await prisma.seccion.findFirstOrThrow({ where: { codigoSeccion: 'AGR-A00' } })).profesorId).toBeNull();

    const dedicacion = await prisma.profesorDedicacion.findUniqueOrThrow({
      where: { profesorId_periodoId: { profesorId: ids.carlos, periodoId: ids.periodoId } },
    });
    const tc = LIMITES_DEDICACION[DedicacionDocente.TIEMPO_COMPLETO];
    expect(dedicacion).toMatchObject({
      dedicacion: DedicacionDocente.TIEMPO_COMPLETO,
      minHorasDocenciaDirecta: tc.minDocencia,
      maxHorasDocenciaDirecta: tc.maxDocencia,
      sedeAdscripcionPrincipalId: ids.sedeId,
    });

    const franjas = (profesorId: string) =>
      prisma.profesorDisponibilidad.findMany({ where: { profesorId, periodoId: ids.periodoId } });
    const deAna = await franjas(ids.ana);
    expect(deAna).toHaveLength(18);
    expect(deAna.every((d) => d.disponible && d.prioridadPreferencia === 1 && d.dia !== 'DOMINGO')).toBe(true);
    expect(new Set(deAna.map((d) => d.horaInicio))).toEqual(new Set(['07:30', '09:05', '10:45']));
    expect(new Set(deAna.map((d) => d.dia)).size).toBe(6);

    const deLuis = await franjas(ids.luis);
    expect(deLuis).toHaveLength(36);
    expect(new Set(deLuis.map((d) => d.horaInicio))).toEqual(new Set(['07:30', '09:05', '10:45', '12:30', '14:05', '15:45']));
    expect(await franjas(ids.carlos)).toHaveLength(18);
    expect(await franjas(ids.pedro)).toHaveLength(0);

    const demo = await prisma.espacioFisico.findMany({ where: { codigo: { startsWith: 'AUL-DEMO' } } });
    expect(demo).toHaveLength(1);
    expect(demo[0]).toMatchObject({
      sedeId: ids.sedeId,
      codigo: 'AUL-DEMO-01',
      tipo: 'AULA_TEORICA',
      capacidad: 45,
      activo: true,
    });
  });

  it('es idempotente: una segunda siembra no duplica franjas ni aulas', async () => {
    const resumen = await sembrarDemoManual(prisma);
    expect(resumen.aulasAgregadas).toBe(0);
    expect(resumen.seccionDocente).toBeNull();
    expect(await prisma.profesorDisponibilidad.count({ where: { periodoId: ids.periodoId } })).toBe(18 + 36 + 18);
    expect(await prisma.espacioFisico.count({ where: { codigo: { startsWith: 'AUL-DEMO' } } })).toBe(1);
  });
});
