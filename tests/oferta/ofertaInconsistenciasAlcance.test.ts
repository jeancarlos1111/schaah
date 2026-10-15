import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DedicacionDocente } from '../../src/core/domain/enums';
import { LIMITES_DEDICACION } from '../../src/core/domain/rules/dedicacionRules';
import { crearBaseTemporal, sembrarPeriodoBase } from '../helpers/baseTemporal';
import { fabrica } from '../helpers/fabrica';

const base = crearBaseTemporal('sahad-inconsistencias-alcance-');
const { OfertaInconsistenciasService } = await import('../../src/modules/oferta/services/OfertaInconsistenciasService');
const servicio = new OfertaInconsistenciasService(base.prisma);

let periodoId = '';
let infoId = '';
let cedulaCompartido = '';
let cedulaSoloArq = '';

beforeAll(async () => {
  const f = fabrica(base.prisma);
  const sembrado = await sembrarPeriodoBase(base.prisma);
  periodoId = sembrado.periodoId;
  infoId = sembrado.pfgId;
  const arq = await base.prisma.programaFormacion.create({
    data: { codigo: 'ARQ', nombre: 'Arquitectura', areaConocimiento: 'Arquitectura' },
  });

  const ucInfo = await f.unidad(infoId, 'INF-101', 'Algoritmia');
  const ucArq = await f.unidad(arq.id, 'ARQ-101', 'Diseño I');
  await f.unidad(infoId, 'INF-PROV', 'Seminario provisional', { codigoProvisional: true }).then((u) =>
    f.seccion({ periodoId, unidadId: u.id, sedeId: sembrado.sedeId, codigo: 'INF-PROV-01', horas: 2 })
  );
  await f.unidad(arq.id, 'ARQ-PROV', 'Taller provisional', { codigoProvisional: true }).then((u) =>
    f.seccion({ periodoId, unidadId: u.id, sedeId: sembrado.sedeId, codigo: 'ARQ-PROV-01', horas: 2 })
  );

  const compartido = await f.profesor('Carla Méndez');
  const soloArq = await f.profesor('Rubén Salas');
  cedulaCompartido = compartido.cedula;
  cedulaSoloArq = soloArq.cedula;
  const tc = LIMITES_DEDICACION[DedicacionDocente.TIEMPO_COMPLETO];
  for (const profesorId of [compartido.id, soloArq.id]) {
    await base.prisma.profesorDedicacion.create({
      data: {
        profesorId,
        periodoId,
        dedicacion: DedicacionDocente.TIEMPO_COMPLETO,
        horasPermanenciaSemanales: tc.maxPermanencia,
        minHorasDocenciaDirecta: tc.minDocencia,
        maxHorasDocenciaDirecta: tc.maxDocencia,
        sedeAdscripcionPrincipalId: sembrado.sedeId,
      },
    });
  }

  const seccion = (codigo: string, unidadId: string, profesorId: string | null, horas: number) =>
    f.seccion({ periodoId, unidadId, sedeId: sembrado.sedeId, codigo, profesorId, horas });
  await seccion('INF-101-01', ucInfo.id, compartido.id, 6);
  await seccion('INF-101-02', ucInfo.id, compartido.id, 4);
  await seccion('ARQ-101-01', ucArq.id, compartido.id, 6);
  await seccion('ARQ-101-02', ucArq.id, soloArq.id, 16);
  await seccion('INF-101-03', ucInfo.id, null, 4);
  await seccion('ARQ-101-03', ucArq.id, null, 4);
});

afterAll(() => base.cerrar());

describe('Reporte de inconsistencias acotado al alcance del coordinador (Spec 06 / Spec 10)', () => {
  it('sin alcance (administrador) incluye todos los programas', async () => {
    const r = await servicio.generarReporte(periodoId);
    expect(r.filas.vacantes.map((v) => v.codigoSeccion).sort()).toEqual(['ARQ-101-03', 'ARQ-PROV-01', 'INF-101-03', 'INF-PROV-01']);
    expect(r.filas.sobrecargas.map((s) => s.cedula).sort()).toEqual([cedulaCompartido, cedulaSoloArq].sort());
    expect(r.filas['codigos-provisionales'].map((u) => u.codigo).sort()).toEqual(['ARQ-PROV', 'INF-PROV']);
  });

  it('con sus programas solo trae vacantes, códigos provisionales y docentes de esos programas', async () => {
    const r = await servicio.generarReporte(periodoId, { pfgIds: [infoId] });
    expect(r.filas.vacantes.map((v) => v.codigoSeccion).sort()).toEqual(['INF-101-03', 'INF-PROV-01']);
    expect(r.filas['codigos-provisionales'].map((u) => u.codigo)).toEqual(['INF-PROV']);
    expect(r.filas.sobrecargas.map((s) => s.cedula)).toEqual([cedulaCompartido]);
  });

  it('la sobrecarga del docente compartido usa su carga total real, incluida la de otros programas (H-04)', async () => {
    const r = await servicio.generarReporte(periodoId, { pfgIds: [infoId] });
    expect(r.filas.sobrecargas[0]).toMatchObject({ cedula: cedulaCompartido, horas: 16, maxHoras: 12, exceso: 4, asignaciones: 3 });
  });

  it('un coordinador sin programas asignados no ve inconsistencias', async () => {
    const r = await servicio.generarReporte(periodoId, { pfgIds: [] });
    expect(Object.values(r.totales).every((n) => n === 0)).toBe(true);
  });
});
