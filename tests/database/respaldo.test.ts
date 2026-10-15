import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import {
  RespaldoNoSoportadoError,
  esBaseSqlite,
  etiquetaRespaldoOferta,
  nombreRespaldo,
  respaldarBaseDatos,
  rotarRespaldos,
} from '../../src/core/database/respaldo';

describe('Respaldo de la base de datos: nombres y rotación', () => {
  it('genera nombres ordenables por fecha y etiquetas sin acentos ni espacios', () => {
    const fecha = new Date('2026-10-15T14:05:09.042Z');
    expect(nombreRespaldo('Antes Oferta 2026-II', fecha)).toBe('sahad_2026-10-15_14-05-09-042_antes-oferta-2026-ii.db');
    expect(nombreRespaldo('Importación ÚNICA', fecha)).toBe('sahad_2026-10-15_14-05-09-042_importacion-unica.db');
    expect(nombreRespaldo('***', fecha)).toBe('sahad_2026-10-15_14-05-09-042_manual.db');
    expect(nombreRespaldo('a', new Date('2026-01-02T00:00:00Z')) < nombreRespaldo('a', fecha)).toBe(true);
  });

  it('etiqueta el respaldo previo a la oferta con el nombre del libro sin extensión ni ruta', () => {
    const fecha = new Date('2026-10-15T14:05:09.042Z');
    expect(etiquetaRespaldoOferta('oferta-2026-II.xlsx')).toBe('antes-oferta-oferta-2026-II');
    expect(etiquetaRespaldoOferta('/tmp/libros/CONSOLIDADO 2026.xlsx')).toBe('antes-oferta-CONSOLIDADO 2026');
    expect(etiquetaRespaldoOferta('C:\\Usuarios\\coord\\oferta.v2.xlsx')).toBe('antes-oferta-oferta.v2');
    expect(nombreRespaldo(etiquetaRespaldoOferta('oferta-2026-II.xlsx'), fecha)).toBe(
      'sahad_2026-10-15_14-05-09-042_antes-oferta-oferta-2026-ii.db'
    );
  });

  it('conserva solo los respaldos más recientes y no toca otros archivos', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'sahad-rotacion-'));
    try {
      const nombres = [1, 2, 3, 4, 5].map((d) => nombreRespaldo('auto', new Date(`2026-10-0${d}T10:00:00Z`)));
      nombres.forEach((n) => writeFileSync(path.join(dir, n), 'x'));
      writeFileSync(path.join(dir, 'notas.txt'), 'no es respaldo');

      const eliminados = rotarRespaldos(dir, 2);

      expect(eliminados.sort()).toEqual(nombres.slice(0, 3));
      expect(readdirSync(dir).sort()).toEqual([...nombres.slice(3), 'notas.txt'].sort());
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('solo admite bases SQLite', async () => {
    expect(esBaseSqlite('file:./dev.db')).toBe(true);
    expect(esBaseSqlite('postgresql://u:p@localhost/sahad')).toBe(false);
    await expect(
      respaldarBaseDatos({} as PrismaClient, { url: 'postgresql://u:p@localhost/sahad' })
    ).rejects.toBeInstanceOf(RespaldoNoSoportadoError);
  });
});

describe('Respaldo de la base de datos: copia real de SQLite en modo WAL', () => {
  const raiz = path.resolve(__dirname, '../..');
  const directorio = mkdtempSync(path.join(tmpdir(), 'sahad-respaldo-'));
  const url = `file:${path.join(directorio, 'origen.db')}`;
  let prisma: PrismaClient;

  beforeAll(async () => {
    execFileSync(path.join(raiz, 'node_modules/.bin/prisma'), ['db', 'push', '--skip-generate', '--schema', 'prisma/schema.prisma'], {
      cwd: raiz,
      env: { ...process.env, DATABASE_URL: url },
      stdio: 'pipe',
    });
    prisma = new PrismaClient({ datasourceUrl: url });
    await prisma.$queryRawUnsafe('PRAGMA journal_mode = WAL;');
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    rmSync(directorio, { recursive: true, force: true });
  });

  it('incluye los datos aún no consolidados del WAL y el respaldo se puede abrir con Prisma', async () => {
    await prisma.sede.create({ data: { codigo: 'SEDE', nombre: 'Sede UBV Bolívar', ejeTerritorial: 'Kerepakupai Vena' } });
    await prisma.periodoAcademico.create({
      data: { codigo: '2026-II', nombre: 'Período 2026-II', fechaInicio: new Date('2026-09-14'), fechaFin: new Date('2027-01-29') },
    });

    const destinoDir = path.join(directorio, 'backups');
    mkdirSync(destinoDir);
    const destino = await respaldarBaseDatos(prisma, { etiqueta: 'antes oferta', directorio: destinoDir, url });

    expect(existsSync(destino)).toBe(true);
    expect(path.basename(destino)).toMatch(/_antes-oferta\.db$/);

    const copia = new PrismaClient({ datasourceUrl: `file:${destino}` });
    try {
      expect(await copia.sede.count()).toBe(1);
      expect((await copia.periodoAcademico.findFirstOrThrow()).codigo).toBe('2026-II');
    } finally {
      await copia.$disconnect();
    }
  });
});
