import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'net';
import { RolUsuario } from '../../src/core/domain/enums';
import {
  SeccionDiagnostico,
  bloquesRequeridosPorHoras,
  diagnosticarFactibilidad,
  horasSemanalesSeccion,
} from '../../src/core/domain/rules/diagnosticoFactibilidad';
import { evaluarSolucion } from '../../src/modules/solver/evaluator';
import { DocenteSolverData, EspacioSolverData, SolverInput } from '../../src/modules/solver/types';
import { crearBaseTemporal, sembrarPeriodoBase } from '../helpers/baseTemporal';
import { fabrica } from '../helpers/fabrica';
import { UsuarioSesion, peticion, respuesta } from '../helpers/peticiones';
import { propuestaBloque, seccionSolver } from '../helpers/solver';

const UUID_CARLOS = '3f2b9c1e-8a7d-4e6f-9b0a-1c2d3e4f5a6b';
const UUID_AULA = '7c6d5e4f-3a2b-4c1d-8e9f-0a1b2c3d4e5f';
const UUID_GRUPO = '9e8d7c6b-5a4f-4e3d-a2c1-b0a9f8e7d6c5';
const UUID_SEDE_A = 'a1a1a1a1-0000-4000-8000-000000000001';
const UUID_SEDE_B = 'b2b2b2b2-0000-4000-8000-000000000002';

const carlos: DocenteSolverData = {
  id: UUID_CARLOS,
  cedula: 'V-12345678',
  nombreCompleto: 'Carlos Gómez',
  disponibilidades: [],
};
const aula: EspacioSolverData = {
  id: UUID_AULA,
  codigo: 'A-101',
  nombre: 'Aula 101',
  tipo: 'AULA_TEORICA',
  capacidad: 40,
  sedeId: UUID_SEDE_A,
  activa: true,
};

function entrada(datos: Partial<SolverInput>): SolverInput {
  return {
    periodoId: 'periodo',
    seccionesPendientes: [],
    docentes: new Map([[UUID_CARLOS, carlos]]),
    espacios: [aula],
    horariosExistentes: [],
    nombresSedes: new Map([
      [UUID_SEDE_A, 'Los Chaguaramos'],
      [UUID_SEDE_B, 'Aldea Caroní'],
    ]),
    ...datos,
  };
}

const mensajeDe = (codigo: string, violaciones: { codigoRegla: string; mensaje: string }[]) => {
  const v = violaciones.find((x) => x.codigoRegla === codigo);
  expect(v, `se esperaba una violación ${codigo}`).toBeDefined();
  return v!.mensaje;
};

describe('Mensajes del optimizador con nombres y códigos legibles (evaluador real)', () => {
  it('H-01 nombra al docente, las secciones en conflicto y la hora en 12 horas', () => {
    const secciones = [
      seccionSolver({ id: 's1', codigoSeccion: 'INF-101-01', profesorId: UUID_CARLOS }),
      seccionSolver({ id: 's2', codigoSeccion: 'MAT-101-01', profesorId: UUID_CARLOS, grupoId: 'otro-grupo' }),
    ];
    const resultado = evaluarSolucion(
      [
        propuestaBloque({ seccionId: 's1', codigoSeccion: 'INF-101-01', dia: 'LUNES', horaInicio: '14:05', profesorId: UUID_CARLOS }),
        propuestaBloque({ seccionId: 's2', codigoSeccion: 'MAT-101-01', dia: 'LUNES', horaInicio: '14:05', profesorId: UUID_CARLOS }),
      ],
      entrada({ seccionesPendientes: secciones })
    );
    const mensaje = mensajeDe('H-01', resultado.violacionesDuras);
    expect(mensaje).toBe(
      'Conflicto H-01: El docente Carlos Gómez tiene asignaciones solapadas el LUNES a las 02:05 PM (secciones INF-101-01, MAT-101-01).'
    );
  });

  it('H-02 identifica el aula por su código y no por su identificador interno', () => {
    const secciones = [
      seccionSolver({ id: 's1', codigoSeccion: 'INF-101-01' }),
      seccionSolver({ id: 's2', codigoSeccion: 'ARQ-101-01', grupoId: 'otro-grupo' }),
    ];
    const resultado = evaluarSolucion(
      [
        propuestaBloque({ seccionId: 's1', codigoSeccion: 'INF-101-01', dia: 'MARTES', horaInicio: '07:30', espacioFisicoId: UUID_AULA }),
        propuestaBloque({ seccionId: 's2', codigoSeccion: 'ARQ-101-01', dia: 'MARTES', horaInicio: '07:30', espacioFisicoId: UUID_AULA }),
      ],
      entrada({ seccionesPendientes: secciones })
    );
    const mensaje = mensajeDe('H-02', resultado.violacionesDuras);
    expect(mensaje).toContain('El espacio A-101 está ocupado por varias secciones el MARTES a las 07:30 AM');
    expect(mensaje).not.toContain(UUID_AULA);
  });

  it('H-03 usa el código del grupo y lista también la sección ya programada', () => {
    const secciones = [seccionSolver({ id: 's1', codigoSeccion: 'INF-102-01', grupoId: UUID_GRUPO, grupoCodigo: 'KV-INF-01-A' })];
    const resultado = evaluarSolucion(
      [propuestaBloque({ seccionId: 's1', codigoSeccion: 'INF-102-01', dia: 'MIERCOLES', horaInicio: '09:05' })],
      entrada({
        seccionesPendientes: secciones,
        horariosExistentes: [
          {
            id: 'h1',
            seccionId: 'existente',
            codigoSeccion: 'INF-101-01',
            grupoId: UUID_GRUPO,
            grupoCodigo: 'KV-INF-01-A',
            sedeId: UUID_SEDE_A,
            dia: 'MIERCOLES',
            horaInicio: '09:05',
            horaFin: '10:35',
          },
        ],
      })
    );
    const mensaje = mensajeDe('H-03', resultado.violacionesDuras);
    expect(mensaje).toBe(
      'Conflicto H-03: La cohorte del grupo KV-INF-01-A tiene más de una clase el MIERCOLES a las 09:05 AM (secciones INF-101-01, INF-102-01).'
    );
    expect(mensaje).not.toContain(UUID_GRUPO);
  });

  it('H-09 nombra al docente y las sedes del traslado imposible', () => {
    const secciones = [
      seccionSolver({ id: 's1', codigoSeccion: 'INF-101-01', profesorId: UUID_CARLOS, sedeId: UUID_SEDE_A }),
      seccionSolver({ id: 's2', codigoSeccion: 'INF-201-01', profesorId: UUID_CARLOS, sedeId: UUID_SEDE_B, grupoId: 'otro-grupo' }),
    ];
    const resultado = evaluarSolucion(
      [
        propuestaBloque({ seccionId: 's1', codigoSeccion: 'INF-101-01', dia: 'JUEVES', horaInicio: '07:30', profesorId: UUID_CARLOS, sedeId: UUID_SEDE_A }),
        propuestaBloque({ seccionId: 's2', codigoSeccion: 'INF-201-01', dia: 'JUEVES', horaInicio: '09:05', profesorId: UUID_CARLOS, sedeId: UUID_SEDE_B }),
      ],
      entrada({ seccionesPendientes: secciones })
    );
    const mensaje = mensajeDe('H-09', resultado.violacionesDuras);
    expect(mensaje).toBe(
      'Conflicto H-09: Traslado insuficiente (5 min < 90 min) para el docente Carlos Gómez entre las sedes Los Chaguaramos y Aldea Caroní el JUEVES.'
    );
  });

  it('ningún mensaje expone identificadores internos ni horas de 24 horas', () => {
    const secciones = [
      seccionSolver({ id: 's1', codigoSeccion: 'INF-101-01', profesorId: UUID_CARLOS, grupoId: UUID_GRUPO, sedeId: UUID_SEDE_A }),
      seccionSolver({ id: 's2', codigoSeccion: 'INF-101-02', profesorId: UUID_CARLOS, grupoId: UUID_GRUPO, sedeId: UUID_SEDE_B }),
    ];
    const resultado = evaluarSolucion(
      [
        propuestaBloque({ seccionId: 's1', codigoSeccion: 'INF-101-01', dia: 'VIERNES', horaInicio: '17:30', profesorId: UUID_CARLOS, espacioFisicoId: UUID_AULA, sedeId: UUID_SEDE_A }),
        propuestaBloque({ seccionId: 's2', codigoSeccion: 'INF-101-02', dia: 'VIERNES', horaInicio: '17:30', profesorId: UUID_CARLOS, espacioFisicoId: UUID_AULA, sedeId: UUID_SEDE_B }),
      ],
      entrada({ seccionesPendientes: secciones })
    );
    expect(resultado.violacionesDuras.length).toBeGreaterThanOrEqual(4);
    for (const v of resultado.violacionesDuras) {
      expect(v.mensaje).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
      expect(v.mensaje).not.toMatch(/\b(1[3-9]|2[0-3]):[0-5]\d\b/);
    }
  });
});

describe('Diagnóstico de factibilidad previo a la optimización (regla de dominio)', () => {
  const seccion = (datos: Partial<SeccionDiagnostico> & { codigoSeccion: string }): SeccionDiagnostico => ({
    nombreMateria: `Materia ${datos.codigoSeccion}`,
    profesorId: null,
    profesorNombre: null,
    sedeId: 'sede',
    cuposEstimados: 30,
    bloquesRequeridos: 2,
    tipoEspacioRequerido: 'AULA_TEORICA',
    esProyectoComunitario: false,
    ...datos,
  });
  const aulas = [{ sedeId: 'sede', tipo: 'AULA_TEORICA', capacidad: 35 }];

  it('las horas de la oferta mandan sobre las de la malla y cada bloque cubre 2 horas académicas', () => {
    const uc = { horasTeoricasSemanales: 2, horasPracticasSemanales: 2, horasCampoComunitarioSemanales: 0 };
    expect(horasSemanalesSeccion(6, uc)).toBe(6);
    expect(horasSemanalesSeccion(null, uc)).toBe(4);
    expect(horasSemanalesSeccion(0, uc)).toBe(4);
    expect(bloquesRequeridosPorHoras(6)).toBe(3);
    expect(bloquesRequeridosPorHoras(1)).toBe(1);
  });

  it('es factible cuando cada docente declaró franjas suficientes y hay aula de aforo suficiente', () => {
    const r = diagnosticarFactibilidad(
      [seccion({ codigoSeccion: 'INF-101-01', profesorId: 'p1', profesorNombre: 'Carlos Gómez' })],
      new Map([['p1', 4]]),
      aulas
    );
    expect(r).toEqual({
      docentesAsignados: 1,
      docentesConDisponibilidad: 1,
      seccionesSinDocente: 0,
      seccionesSinAula: 0,
      factible: true,
      avisos: [],
    });
  });

  it('advierte del docente sin disponibilidad, del que tiene menos franjas que bloques y de la sección sin aula', () => {
    const r = diagnosticarFactibilidad(
      [
        seccion({ codigoSeccion: 'INF-101-01', profesorId: 'p1', profesorNombre: 'Carlos Gómez' }),
        seccion({ codigoSeccion: 'INF-101-02', profesorId: 'p1', profesorNombre: 'Carlos Gómez' }),
        seccion({ codigoSeccion: 'MAT-101-01', profesorId: 'p2', profesorNombre: 'Ana Rivas', bloquesRequeridos: 3 }),
        seccion({ codigoSeccion: 'ARQ-101-01', cuposEstimados: 50 }),
        seccion({ codigoSeccion: 'PC-101-01', cuposEstimados: 80, esProyectoComunitario: true }),
      ],
      new Map([['p2', 2]]),
      aulas
    );
    expect(r.factible).toBe(false);
    expect(r.docentesAsignados).toBe(2);
    expect(r.docentesConDisponibilidad).toBe(1);
    expect(r.seccionesSinDocente).toBe(2);
    expect(r.seccionesSinAula).toBe(1);
    expect(r.avisos).toEqual([
      'La sección ARQ-101-01 (Materia ARQ-101-01) no tiene en su sede un espacio con aforo para 50 cupos.',
      'El docente Carlos Gómez no ha declarado disponibilidad en el período: sus secciones INF-101-01, INF-101-02 no se podrán programar.',
      'El docente Ana Rivas declaró 2 franjas disponibles y sus secciones pendientes requieren 3 bloques semanales.',
    ]);
  });

  it('los laboratorios admiten la tolerancia de 5 cupos de H-07 y exigen un espacio de laboratorio', () => {
    const lab = seccion({ codigoSeccion: 'LAB-101-01', tipoEspacioRequerido: 'LABORATORIO_COMPUTACION', cuposEstimados: 28 });
    expect(diagnosticarFactibilidad([lab], new Map(), [{ sedeId: 'sede', tipo: 'LABORATORIO_COMPUTACION', capacidad: 24 }]).seccionesSinAula).toBe(0);
    expect(diagnosticarFactibilidad([lab], new Map(), [{ sedeId: 'sede', tipo: 'LABORATORIO_COMPUTACION', capacidad: 22 }]).seccionesSinAula).toBe(1);
    const soloAulas = diagnosticarFactibilidad([lab], new Map(), aulas);
    expect(soloAulas.avisos[0]).toContain('un espacio de laboratorio con aforo para 28 cupos');
  });
});

const base = crearBaseTemporal('sahad-solver-diagnostico-');
const { SolverController } = await import('../../src/modules/solver/controllers/SolverController');
const { recibirArchivo } = await import('../../src/modules/oferta/ofertaRoutes');

describe('Diagnóstico del optimizador (controlador real sobre SQLite)', () => {
  const ids = {} as Record<'periodo' | 'sede' | 'pfg' | 'carlos' | 'ana', string>;
  let admin: UsuarioSesion;

  beforeAll(async () => {
    const f = fabrica(base.prisma);
    const semilla = await sembrarPeriodoBase(base.prisma);
    ids.periodo = semilla.periodoId;
    ids.sede = semilla.sedeId;
    ids.pfg = semilla.pfgId;
    ids.carlos = (await f.profesor('Carlos Gómez')).id;
    ids.ana = (await f.profesor('Ana Rivas')).id;
    await f.aula(ids.sede, 'Aula 101', 35);
    const unidad = await f.unidad(semilla.pfgId, 'INF-101', 'Algorítmica');
    const seccion = (codigo: string, profesorId: string, horas: number, cupos = 30) =>
      f.seccion({ periodoId: ids.periodo, unidadId: unidad.id, sedeId: ids.sede, codigo, profesorId, horas, cupos });
    await seccion('INF-101-01', ids.carlos, 4);
    await seccion('INF-101-02', ids.ana, 8, 40);
    await base.prisma.profesorDisponibilidad.createMany({
      data: ['LUNES', 'MARTES'].map((dia) => ({
        profesorId: ids.ana,
        periodoId: ids.periodo,
        dia,
        horaInicio: '07:30',
        horaFin: '09:00',
        disponible: true,
      })),
    });
    admin = await f.usuario('admin@ubv.edu.ve', RolUsuario.ADMINISTRADOR);
  }, 120_000);

  afterAll(async () => {
    await base.cerrar();
  });

  const diagnostico = async () => {
    const { res, capturada } = respuesta();
    await SolverController.diagnostico(await peticion({ usuario: admin, params: { id: ids.periodo }, json: true }), res);
    return capturada.json;
  };

  it('no declara factible un período con docentes sin franjas y secciones sin aula', async () => {
    const r = await diagnostico();
    expect(r.ok).toBe(true);
    expect(r.metricas).toMatchObject({
      seccionesPendientes: 2,
      totalHorasPendientes: 12,
      totalBloquesRequeridos: 6,
      docentesAsignados: 2,
      docentesConDisponibilidad: 1,
      seccionesSinProfesor: 0,
      seccionesSinAula: 1,
    });
    expect(r.factible).toBe(false);
    expect(r.avisos).toEqual([
      'La sección INF-101-02 (Algorítmica) no tiene en su sede un espacio con aforo para 40 cupos.',
      'El docente Carlos Gómez no ha declarado disponibilidad en el período: sus secciones INF-101-01 no se podrán programar.',
      'El docente Ana Rivas declaró 2 franjas disponibles y sus secciones pendientes requieren 4 bloques semanales.',
    ]);
  });

  it('pasa a factible cuando se corrigen la disponibilidad y el aforo', async () => {
    await base.prisma.espacioFisico.create({
      data: { sedeId: ids.sede, codigo: 'A-201', nombre: 'Aula 201', capacidad: 45, tipo: 'AULA_TEORICA' },
    });
    await base.prisma.profesorDisponibilidad.createMany({
      data: [
        ...['MIERCOLES', 'JUEVES'].map((dia) => ({ profesorId: ids.ana, dia })),
        ...['LUNES', 'MARTES'].map((dia) => ({ profesorId: ids.carlos, dia })),
      ].map((d) => ({ ...d, periodoId: ids.periodo, horaInicio: '07:30', horaFin: '09:00', disponible: true })),
    });

    const r = await diagnostico();
    expect(r.factible).toBe(true);
    expect(r.avisos).toEqual([]);
    expect(r.metricas.docentesConDisponibilidad).toBe(2);
  });

  it('el optimizador identifica la cohorte por el código normalizado del grupo, como la matriz', async () => {
    const f = fabrica(base.prisma);
    const periodo = await base.prisma.periodoAcademico.create({
      data: { codigo: '2027-I', nombre: 'Período 2027-I', fechaInicio: new Date('2027-02-01'), fechaFin: new Date('2027-07-23') },
    });
    const grupo = await base.prisma.grupoSeccion.create({
      data: { periodoId: periodo.id, pfgId: ids.pfg, sedeId: ids.sede, codigo: 'KV BO FO -01BM', codigoNormalizado: 'KV-BO-FO-01-B-M' },
    });
    const teoria = await f.unidad(ids.pfg, 'INF-301', 'Redes');
    const proyecto = await f.unidad(ids.pfg, 'PRY-301', 'Proyecto III', { esProyectoComunitario: true });
    for (const codigo of ['KV-BO-FO-01-B-M-INF-301', 'KV-BO-FO-01-B-M-INF-302']) {
      const s = await f.seccion({ periodoId: periodo.id, unidadId: teoria.id, sedeId: ids.sede, codigo, grupoId: grupo.id });
      await base.prisma.horarioSeccion.create({ data: { seccionId: s.id, dia: 'LUNES', horaInicio: '07:30', horaFin: '09:00' } });
    }
    await f.seccion({ periodoId: periodo.id, unidadId: proyecto.id, sedeId: ids.sede, codigo: 'KV-BO-FO-01-B-M-PRY-301', grupoId: grupo.id, horas: 2 });

    const { SolverService } = await import('../../src/modules/solver/solverService');
    const resultado = await SolverService.optimizarPeriodo(
      periodo.id,
      { motor: 'GENETICO', tamanoPoblacion: 6, maxGeneraciones: 4 },
      { db: base.prisma }
    );
    const h03 = resultado.violacionesDuras.find((v) => v.codigoRegla === 'H-03');
    expect(h03?.mensaje).toContain('Conflicto H-03: La cohorte del grupo KV-BO-FO-01-B-M tiene más de una clase el LUNES a las 07:30 AM');
    expect(h03?.mensaje).toContain('KV-BO-FO-01-B-M-INF-301');
    expect(h03?.mensaje).toContain('KV-BO-FO-01-B-M-INF-302');
    expect(h03?.mensaje).not.toContain('KV BO FO');
  });
});

describe('Carga del libro de oferta con nombre acentuado', () => {
  it('conserva las tildes del nombre del archivo recibido', async () => {
    const app = express();
    app.post('/periodos/:id/oferta/importar', recibirArchivo, (req, res) => {
      res.json({ nombre: req.file?.originalname });
    });
    const servidor = app.listen(0, '127.0.0.1');
    await new Promise((listo) => servidor.once('listening', listo));
    try {
      const { port } = servidor.address() as AddressInfo;
      const nombre = 'CONSOLIDADO_OFERTA_2026_2_REVISIÓN_Año.xlsx';
      const formulario = new FormData();
      formulario.append('archivo', new Blob([Buffer.from('PK')]), nombre);
      const r = await fetch(`http://127.0.0.1:${port}/periodos/p1/oferta/importar`, { method: 'POST', body: formulario });
      expect(await r.json()).toEqual({ nombre });
    } finally {
      await new Promise((cerrado) => servidor.close(cerrado));
    }
  });
});
