import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { DedicacionDocente, Turno } from '../../src/core/domain/enums';
import {
  ALDEA_CVG_GOSH_CODIGO,
  SEDE_PRINCIPAL_CODIGO,
  normalizarFilaOferta,
} from '../../src/core/domain/rules/ofertaNormalizacion';
import { leerLibroOferta } from '../../src/modules/oferta/ofertaExcel';
import { OfertaImportService } from '../../src/modules/oferta/services/OfertaImportService';
import { OfertaExportService } from '../../src/modules/oferta/services/OfertaExportService';
import {
  CodigoUnidadInvalidoError,
  OfertaInconsistenciasService,
} from '../../src/modules/oferta/services/OfertaInconsistenciasService';
import { FILAS_REALES, libroComoOferta } from './libroOfertaFixture';

/**
 * Integración contra una base SQLite efímera con el esquema real de Prisma:
 * verifica la escritura transaccional, la idempotencia y el ciclo importar → exportar.
 */
describe('Oferta de carga horaria: aplicación sobre base de datos', () => {
  const raiz = path.resolve(__dirname, '../..');
  const directorio = mkdtempSync(path.join(tmpdir(), 'sahad-oferta-'));
  const url = `file:${path.join(directorio, 'oferta.db')}`;
  let prisma: PrismaClient;
  let periodoId: string;

  beforeAll(async () => {
    execFileSync(path.join(raiz, 'node_modules/.bin/prisma'), ['db', 'push', '--skip-generate', '--schema', 'prisma/schema.prisma'], {
      cwd: raiz,
      env: { ...process.env, DATABASE_URL: url },
      stdio: 'pipe',
    });
    prisma = new PrismaClient({ datasourceUrl: url });
    await prisma.sede.create({
      data: { codigo: SEDE_PRINCIPAL_CODIGO, nombre: 'Sede UBV Bolívar', ejeTerritorial: 'Kerepakupai Vena' },
    });
    await prisma.programaFormacion.create({
      data: { codigo: 'PFG-INFO', nombre: 'Informática para la Gestión Social', areaConocimiento: 'Tecnología' },
    });
    const periodo = await prisma.periodoAcademico.create({
      data: { codigo: '2026-II', nombre: 'Período 2026-II', fechaInicio: new Date('2026-09-14'), fechaFin: new Date('2027-01-29') },
    });
    periodoId = periodo.id;
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    rmSync(directorio, { recursive: true, force: true });
  });

  it('crea grupos, asignaciones, docentes, dedicaciones, sedes y centros en una sola transacción', async () => {
    const servicio = new OfertaImportService(prisma);
    const { plan } = await servicio.analizarArchivo(await libroComoOferta(FILAS_REALES), periodoId);
    const r = await servicio.aplicarPlan(plan, periodoId);

    expect(r).toMatchObject({
      programasCreados: 2,
      gruposCreados: 3,
      seccionesCreadas: 9,
      docentesCreados: 3,
      dedicacionesRegistradas: 3,
      sedesCreadas: 1,
      centrosCreados: 2,
    });

    const grupo = await prisma.grupoSeccion.findFirstOrThrow({
      where: { periodoId, codigoNormalizado: 'KV-BO-RC-01-A-M' },
      include: { pfg: true, secciones: { include: { profesor: true } } },
    });
    expect(grupo.pfg.codigo).toBe('PFG-INFO');
    expect(grupo.secciones).toHaveLength(4);
    expect(grupo.secciones.every((s) => s.profesor?.cedula === 'V-14123456')).toBe(true);
    expect(grupo.secciones.map((s) => s.horasSemanalesOferta).sort()).toEqual([4, 4, 4, 6]);

    const maria = await prisma.profesor.findUniqueOrThrow({
      where: { cedula: 'V-14123456' },
      include: { centroEstudio: true, dedicaciones: true },
    });
    expect(maria.email).toBeNull();
    expect(maria.centroEstudio?.codigo).toBe('CECSOTIL');
    expect(maria.anioIngreso).toBe(2008);
    expect(maria.dedicaciones[0]).toMatchObject({ dedicacion: DedicacionDocente.DEDICACION_EXCLUSIVA, maxHorasDocenciaDirecta: 16 });

    const gosh = await prisma.grupoSeccion.findFirstOrThrow({
      where: { periodoId, codigoNormalizado: 'KV-BO-CN-02-B-T' },
      include: { sede: true },
    });
    expect(gosh.sede.codigo).toBe(ALDEA_CVG_GOSH_CODIGO);
    expect(gosh.turno).toBe(Turno.VESPERTINO);

    const ingles = await prisma.unidadCurricular.findFirstOrThrow({ where: { pfg: { codigo: 'IDIOMAS' } } });
    expect(ingles.trayecto).toBeNull();
    expect(ingles.tramo).toBeNull();
  });

  it('reimportar el mismo archivo actualiza sin duplicar', async () => {
    const servicio = new OfertaImportService(prisma);
    const { plan } = await servicio.analizarArchivo(await libroComoOferta(FILAS_REALES), periodoId);
    expect(plan.resumen.asignacionesNuevas).toBe(0);

    const r = await servicio.aplicarPlan(plan, periodoId);
    expect(r).toMatchObject({
      programasCreados: 0,
      unidadesCreadas: 0,
      docentesCreados: 0,
      gruposCreados: 0,
      gruposActualizados: 3,
      seccionesCreadas: 0,
      seccionesActualizadas: 9,
      sedesCreadas: 0,
    });
    expect(await prisma.seccion.count({ where: { periodoId } })).toBe(9);
    expect(await prisma.profesor.count()).toBe(3);
  });

  it('revierte todo si la transacción falla (período inexistente)', async () => {
    const servicio = new OfertaImportService(prisma);
    const { plan } = await servicio.analizarArchivo(await libroComoOferta(FILAS_REALES), periodoId);
    const antes = await prisma.grupoSeccion.count();
    await expect(servicio.aplicarPlan(plan, 'periodo-inexistente')).rejects.toThrow('no existe');
    expect(await prisma.grupoSeccion.count()).toBe(antes);
  });

  it('exporta lo importado con el formato de la hoja y se vuelve a leer con los mismos grupos y docentes', async () => {
    const { contenido, nombreArchivo } = await new OfertaExportService(prisma).exportar(periodoId, 'Coordinación Académica');
    expect(nombreArchivo).toBe('OFERTA_CARGA_HORARIA_2026-II.xlsx');

    const libro = await leerLibroOferta(contenido);
    expect(libro.filaEncabezado).toBe(10);
    expect(libro.meta.titulo).toBe('OFERTA DE CARGA HORARIA 2026-II');
    expect(libro.meta.lineas).toContain('ELABORADO POR: COORDINACIÓN ACADÉMICA');

    const filas = libro.filas.map((f) => normalizarFilaOferta(f.numero, f.celdas));
    expect(filas).toHaveLength(9);
    expect(filas.every((f) => f.errores.length === 0)).toBe(true);
    expect(new Set(filas.map((f) => f.grupoCodigo))).toEqual(new Set(['KV-BO-RC-01-A-M', 'KV-BO-CN-02-B-T', 'ING-01']));
    expect(filas.filter((f) => f.cedula === 'V-14123456')).toHaveLength(4);
    expect(filas.find((f) => f.cedula === 'V-9876543')).toMatchObject({
      pfgCodigo: 'PIU',
      sedeCodigo: ALDEA_CVG_GOSH_CODIGO,
      dedicacion: DedicacionDocente.MEDIO_TIEMPO,
      turno: Turno.VESPERTINO,
    });
    expect(filas.filter((f) => f.pfgCodigo === 'IGS')).toHaveLength(4);
  });

  it('registra cada importación aplicada en la bitácora (la revertida no deja rastro)', async () => {
    const registros = await prisma.importacionOferta.findMany({ where: { periodoId }, orderBy: { createdAt: 'asc' } });
    expect(registros).toHaveLength(2);
    expect(registros[0]).toMatchObject({ nombreArchivo: 'oferta.xlsx', usuarioNombre: 'Sistema' });
    expect(JSON.parse(registros[0].resumen).aplicado).toMatchObject({ seccionesCreadas: 9, gruposCreados: 3 });
    expect(JSON.parse(registros[1].resumen).aplicado).toMatchObject({ seccionesCreadas: 0, seccionesActualizadas: 9 });
    expect(JSON.parse(registros[0].dedicacionesInconsistentes)).toEqual([
      expect.objectContaining({ cedula: 'V-14123456', aplicada: DedicacionDocente.DEDICACION_EXCLUSIVA }),
    ]);
    expect(JSON.parse(registros[0].errores)).toEqual([expect.objectContaining({ fila: 20 })]);

    const provisionales = await prisma.unidadCurricular.findMany({ where: { codigoProvisional: true }, include: { pfg: true } });
    expect(provisionales.map((u) => `${u.pfg.codigo}|${u.codigo}`)).toContain('PIU|PIU-SC');
    expect(provisionales.some((u) => u.codigo === 'IGS-AP-101')).toBe(false);
  });

  it('el reporte de inconsistencias refleja la base: sobrecarga, vacantes, códigos provisionales y dedicación contradictoria', async () => {
    const servicio = new OfertaInconsistenciasService(prisma);
    await servicio.exportar(periodoId, 'Dirección Académica');
    const reporte = await servicio.generarReporte(periodoId);

    expect(reporte.filas.sobrecargas).toEqual([
      expect.objectContaining({ cedula: 'V-14123456', horas: 18, maxHoras: 16, exceso: 2 }),
    ]);
    expect(reporte.totales.vacantes).toBe(3);
    expect(reporte.filas['codigos-provisionales'].map((f) => f.codigo)).toContain('PIU-SC');
    expect(reporte.filas['dedicacion-inconsistente']).toEqual([
      expect.objectContaining({ cedula: 'V-14123456', aplicada: 'Exclusiva', actual: 'Exclusiva' }),
    ]);
    expect(reporte.ultimaImportacion?.nombreArchivo).toBe('oferta.xlsx');
  });

  it('confirmar el código oficial valida RC-01, limpia la marca y la siguiente importación reconoce la UC por nombre', async () => {
    const servicio = new OfertaInconsistenciasService(prisma);
    const seminario = await prisma.unidadCurricular.findFirstOrThrow({ where: { codigo: 'PIU-SC' } });
    const otra = await prisma.unidadCurricular.findFirstOrThrow({
      where: { pfgId: seminario.pfgId, NOT: { id: seminario.id } },
    });

    await expect(servicio.confirmarCodigoUnidad(seminario.id, otra.codigo)).rejects.toThrow('RC-01');
    await expect(servicio.confirmarCodigoUnidad(seminario.id, 'x')).rejects.toBeInstanceOf(CodigoUnidadInvalidoError);
    await expect(servicio.confirmarCodigoUnidad('no-existe', 'PIU-SEM-001')).rejects.toBeInstanceOf(CodigoUnidadInvalidoError);

    expect(await servicio.confirmarCodigoUnidad(seminario.id, ' piu-sem-001 ')).toEqual({ anterior: 'PIU-SC', nuevo: 'PIU-SEM-001' });
    const actualizada = await prisma.unidadCurricular.findUniqueOrThrow({ where: { id: seminario.id } });
    expect(actualizada).toMatchObject({ codigo: 'PIU-SEM-001', codigoProvisional: false });

    const importacion = new OfertaImportService(prisma);
    const { plan } = await importacion.analizarArchivo(await libroComoOferta(FILAS_REALES), periodoId);
    const unidadesAntes = await prisma.unidadCurricular.count();
    await importacion.aplicarPlan(plan, periodoId, { nombreArchivo: 'reimportacion.xlsx', usuarioNombre: 'Coordinación' });
    expect(await prisma.unidadCurricular.count()).toBe(unidadesAntes);
    expect(await prisma.unidadCurricular.count({ where: { codigo: 'PIU-SC' } })).toBe(0);

    const reporte = await new OfertaInconsistenciasService(prisma).generarReporte(periodoId);
    expect(reporte.filas['codigos-provisionales'].map((f) => f.codigo)).not.toContain('PIU-SEM-001');
    expect(reporte.ultimaImportacion).toMatchObject({ nombreArchivo: 'reimportacion.xlsx', usuarioNombre: 'Coordinación' });
  });
});
