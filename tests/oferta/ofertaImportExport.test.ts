import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { DedicacionDocente, TipoPrograma, Turno } from '../../src/core/domain/enums';
import {
  ALDEA_CVG_GOSH_CODIGO,
  SEDE_PRINCIPAL_CODIGO,
  normalizarFilaOferta,
} from '../../src/core/domain/rules/ofertaNormalizacion';
import { FILAS_REALES, libroComoOferta } from './libroOfertaFixture';
import {
  FILA_ENCABEZADO_OFERTA,
  FormatoOfertaInvalidoError,
  generarLibroOferta,
  leerLibroOferta,
} from '../../src/modules/oferta/ofertaExcel';
import { CatalogoActual, planificarImportacion } from '../../src/modules/oferta/ofertaPlanificador';
import { SeccionExportable, construirFilasOferta } from '../../src/modules/oferta/ofertaExportador';

const CATALOGO_VACIO: CatalogoActual = {
  programas: [],
  unidades: [],
  docentes: [],
  sedes: [SEDE_PRINCIPAL_CODIGO],
  centros: [],
  grupos: [],
  secciones: [],
};

async function normalizarLibro(buffer: Buffer) {
  const libro = await leerLibroOferta(buffer);
  return { libro, filas: libro.filas.map((f) => normalizarFilaOferta(f.numero, f.celdas)) };
}

describe('Oferta de carga horaria: lectura del libro .xlsx', () => {
  it('ubica el encabezado en la fila 10, extrae metadatos y convierte celdas enriquecidas y fórmulas', async () => {
    const buffer = await libroComoOferta(FILAS_REALES, (hoja) => {
      hoja.getCell('D11').value = { richText: [{ text: 'ALGORITMOS ' }, { text: 'Y PROGRAMACIÓN', font: { bold: true } }] };
      hoja.getCell('E11').value = { formula: '2+2', result: 4 };
    });
    const libro = await leerLibroOferta(buffer);

    expect(libro.hoja).toBe('OFERTA 2026-II TODA');
    expect(libro.filaEncabezado).toBe(10);
    expect(libro.meta.titulo).toBe('ACTUALIZACIÓN DE OFERTA CARGA HORARIA 2026-II');
    expect(libro.meta.lineas).toContain('ELABORADO POR : DRA. YORLIS MORA DE MONTERO');
    expect(libro.filas).toHaveLength(FILAS_REALES.length);
    expect(libro.filas[0].numero).toBe(11);
    expect(libro.filas[0].celdas.D).toBe('ALGORITMOS Y PROGRAMACIÓN');
    expect(libro.filas[0].celdas.E).toBe(4);
  });

  it('rechaza libros que no tienen la estructura de la oferta', async () => {
    const libro = new ExcelJS.Workbook();
    libro.addWorksheet('Hoja1').getCell('A1').value = 'Listado cualquiera';
    const buffer = Buffer.from((await libro.xlsx.writeBuffer()) as ArrayBuffer);
    await expect(leerLibroOferta(buffer)).rejects.toBeInstanceOf(FormatoOfertaInvalidoError);
    await expect(leerLibroOferta(Buffer.from('no es un xlsx'))).rejects.toBeInstanceOf(FormatoOfertaInvalidoError);
  });
});

describe('Oferta de carga horaria: plan de importación', () => {
  it('agrupa variantes del mismo código de sección en un solo grupo (cohorte)', async () => {
    const { filas } = await normalizarLibro(await libroComoOferta(FILAS_REALES));
    const plan = planificarImportacion(filas, CATALOGO_VACIO);

    const rc01 = plan.grupos.find((g) => g.codigoNormalizado === 'KV-BO-RC-01-A-M')!;
    expect(rc01.asignaciones).toBe(4);
    expect(rc01.pfgCodigo).toBe('PFG-INFO');
    expect(rc01.turno).toBe(Turno.MATUTINO);
    expect(rc01.cantidadEstudiantes).toBe(32);
    expect(rc01.ejeMunicipal).toBe('RÍO CAURA');
    expect(plan.asignaciones.filter((a) => a.grupoClave === rc01.clave).map((a) => a.codigoSeccion)).toEqual([
      'KV-BO-RC-01-A-M-IGS-AP-101',
      'KV-BO-RC-01-A-M-IGS-IW-102',
      'KV-BO-RC-01-A-M-IGS-BC-103',
      'KV-BO-RC-01-A-M-IGS-II-104',
    ]);
  });

  it('unifica cédulas en distintos formatos, identifica por nombre y detecta sobrecarga H-04', async () => {
    const { filas } = await normalizarLibro(await libroComoOferta(FILAS_REALES));
    const plan = planificarImportacion(filas, CATALOGO_VACIO);

    const maria = plan.docentes.find((d) => d.cedula === 'V-14123456')!;
    expect(plan.docentes.filter((d) => d.cedula === 'V-14123456')).toHaveLength(1);
    expect(maria.nombres).toBe('Maria Jose');
    expect(maria.apellidos).toBe('Perez Rojas');
    expect(maria.horas).toBe(18);
    expect(maria.dedicacion).toBe(DedicacionDocente.DEDICACION_EXCLUSIVA);
    expect(maria.centroEstudio).toBe('CECSOTIL');

    const filaSinCedula = plan.asignaciones.find((a) => a.fila === 14)!;
    expect(filaSinCedula.cedula).toBe('V-14123456');
    expect(plan.avisos.some((a) => a.fila === 14 && a.mensaje.includes('identificado por nombre'))).toBe(true);

    const sobrecarga = plan.sobrecargas.find((s) => s.cedula === 'V-14123456')!;
    expect(sobrecarga.horas).toBe(18);
    expect(sobrecarga.maxHoras).toBe(16);
    expect(sobrecarga.mensaje).toContain('H-04');

    const inconsistente = plan.dedicacionesInconsistentes.find((d) => d.cedula === 'V-14123456')!;
    expect(inconsistente.valores).toEqual([DedicacionDocente.DEDICACION_EXCLUSIVA, DedicacionDocente.TIEMPO_COMPLETO]);
    expect(inconsistente.aplicada).toBe(DedicacionDocente.DEDICACION_EXCLUSIVA);
  });

  it('genera un solo código para UCs sin codificar y numera la UC repetida dentro del grupo', async () => {
    const { filas } = await normalizarLibro(await libroComoOferta(FILAS_REALES));
    const plan = planificarImportacion(filas, CATALOGO_VACIO);

    const seminario = plan.unidades.filter((u) => u.pfgCodigo === 'PIU' && u.nombre === 'Seminario De Contexto');
    expect(seminario).toHaveLength(1);
    expect(seminario[0].codigoGenerado).toBe(true);
    expect(seminario[0].codigo).toBe('PIU-SC');

    const codigos = plan.asignaciones.filter((a) => a.ucCodigo === 'PIU-SC').map((a) => a.codigoSeccion);
    expect(codigos).toEqual(['KV-BO-CN-02-B-T-PIU-SC', 'KV-BO-CN-02-B-T-PIU-SC-2']);
    expect(plan.avisos.some((a) => a.mensaje.includes('aparece 2 veces'))).toBe(true);
  });

  it('asigna sedes, programas implícitos, horarios observados y reporta filas inválidas', async () => {
    const { filas } = await normalizarLibro(await libroComoOferta(FILAS_REALES));
    const plan = planificarImportacion(filas, CATALOGO_VACIO);

    expect(plan.sedesNuevas).toEqual([ALDEA_CVG_GOSH_CODIGO]);
    expect(plan.grupos.find((g) => g.codigoNormalizado === 'KV-BO-CN-02-B-T')!.sedeCodigo).toBe(ALDEA_CVG_GOSH_CODIGO);

    const idiomas = plan.programas.find((p) => p.codigo === 'IDIOMAS')!;
    expect(idiomas.tipo).toBe(TipoPrograma.IDIOMAS);
    const ingles = plan.grupos.find((g) => g.codigoNormalizado === 'ING-01')!;
    expect(ingles.trayecto).toBeNull();
    expect(ingles.turno).toBe(Turno.FIN_DE_SEMANA);

    expect(plan.horariosObservados).toEqual([
      expect.objectContaining({ dia: 'MARTES', horaInicio: '13:30', horaFin: '15:30', horaInicio12: '01:30 PM', horaFin12: '03:30 PM' }),
    ]);

    expect(plan.errores).toEqual([{ fila: 20, mensaje: 'Fila sin código de sección.' }]);
    expect(plan.resumen.filasConError).toBe(1);
    expect(plan.resumen.asignacionesSinDocente).toBe(3);
  });

  it('toma el eje municipal y el centro de estudio aunque vengan abreviados o en otra columna', async () => {
    const { filas } = await normalizarLibro(await libroComoOferta(FILAS_REALES));
    const plan = planificarImportacion(filas, CATALOGO_VACIO);

    expect(plan.grupos.find((g) => g.codigoNormalizado === 'KV-BO-CN-02-B-T')!.ejeMunicipal).toBe('RÍO CARONÍ');
    expect(plan.docentes.find((d) => d.cedula === 'V-9876543')!.centroEstudio).toBe('CEPEC');
    expect(plan.centros.sort()).toEqual(['CECSOTIL', 'CEPEC']);
  });

  it('es idempotente: con el catálogo ya cargado no propone altas nuevas', async () => {
    const { filas } = await normalizarLibro(await libroComoOferta(FILAS_REALES));
    const primero = planificarImportacion(filas, CATALOGO_VACIO);

    const catalogoCargado: CatalogoActual = {
      programas: primero.programas.map((p) => ({ codigo: p.codigo, nombre: p.nombre })),
      unidades: primero.unidades.map((u) => ({ pfgCodigo: u.pfgCodigo, codigo: u.codigo, nombre: u.nombre })),
      docentes: primero.docentes.map((d) => ({ cedula: d.cedula, nombres: d.nombres, apellidos: d.apellidos })),
      sedes: [SEDE_PRINCIPAL_CODIGO, ...primero.sedesNuevas],
      centros: primero.centros,
      grupos: primero.grupos.map((g) => ({ pfgCodigo: g.pfgCodigo, codigoNormalizado: g.codigoNormalizado })),
      secciones: primero.asignaciones.map((a) => a.codigoSeccion),
    };
    const segundo = planificarImportacion(filas, catalogoCargado);

    expect(segundo.resumen).toMatchObject({
      programasNuevos: 0,
      unidadesNuevas: 0,
      docentesNuevos: 0,
      gruposNuevos: 0,
      asignacionesNuevas: 0,
      sedesNuevas: 0,
    });
    expect(segundo.asignaciones.map((a) => a.codigoSeccion)).toEqual(primero.asignaciones.map((a) => a.codigoSeccion));
  });

  it('reutiliza el código de una UC existente cuando la oferta no lo trae', async () => {
    const { filas } = await normalizarLibro(await libroComoOferta(FILAS_REALES));
    const plan = planificarImportacion(filas, {
      ...CATALOGO_VACIO,
      programas: [{ codigo: 'PIU', nombre: 'Programa de Iniciación Universitaria' }],
      unidades: [{ pfgCodigo: 'PIU', codigo: 'PIU-001', nombre: 'Seminario de Contexto' }],
    });
    expect(plan.asignaciones.filter((a) => a.ucCodigo === 'PIU-001')).toHaveLength(2);
    expect(plan.unidades.find((u) => u.codigo === 'PIU-001')!.nuevo).toBe(false);
    expect(plan.programas.find((p) => p.codigo === 'PIU')!.nuevo).toBe(false);
  });
});

describe('Oferta de carga horaria: exportación con el formato institucional', () => {
  const seccion = (over: Partial<SeccionExportable> = {}): SeccionExportable => ({
    codigoSeccion: 'KV-BO-RC-01-A-M-IGS-AP-101',
    turno: Turno.MATUTINO,
    cuposEstimados: 32,
    horasSemanalesOferta: 4,
    aulaEspecializada: 'TALLER COMPUTACION',
    observaciones: null,
    sede: { codigo: SEDE_PRINCIPAL_CODIGO, nombre: 'Sede UBV Bolívar', ejeMunicipal: 'RÍO CAURA' },
    unidadCurricular: {
      codigo: 'IGS-AP-101',
      nombre: 'Algoritmos y Programación',
      trayecto: 1,
      tramo: 1,
      horasTeoricasSemanales: 3,
      horasPracticasSemanales: 3,
      pfg: { codigo: 'PFG-INFO' },
    },
    grupo: {
      codigo: 'KV BO-RC 01 A-M',
      codigoNormalizado: 'KV-BO-RC-01-A-M',
      trayecto: 1,
      tramo: 1,
      malla: 'DIURNA',
      turno: Turno.MATUTINO,
      estatus: 'CONTINUA',
      cantidadEstudiantes: 32,
      seccionesAsesoria: 1,
      nroEncuentros: 16,
      ejeMunicipal: 'RÍO CAURA',
    },
    profesor: {
      cedula: 'V-14123456',
      nombres: 'Maria Jose',
      apellidos: 'Perez Rojas',
      condicion: 'ORDINARIO',
      escalafon: 'AUXILIAR_DOCENTE',
      profesion: 'Ingeniera en Informática',
      estudiosCuartoNivel: 'MSc. Telemática',
      anioIngreso: 2008,
      anioConcurso: 2012,
      centroEstudio: { codigo: 'CECSOTIL' },
      dedicaciones: [{ dedicacion: DedicacionDocente.DEDICACION_EXCLUSIVA }],
    },
    ...over,
  });

  it('traduce el modelo SAHAD a los valores de la hoja (códigos de programa, etiquetas, cédula numérica)', () => {
    const [fila] = construirFilasOferta([seccion()]);
    expect(fila).toMatchObject({
      A: 'IGS',
      D: 'ALGORITMOS Y PROGRAMACIÓN',
      E: 4,
      F: 'KV BO-RC 01 A-M',
      H: 14123456,
      I: 'MARIA JOSE PEREZ ROJAS',
      J: 'EXCLUSIVA',
      K: 'AUXILIAR DOCENTE',
      S: 'MAÑANA',
      X: 'KEREPAKUPAI VENA',
      AB: 'SEDE',
    });
  });

  it('usa HT+HP cuando la oferta no fijó horas y marca POR ASIGNAR sin docente', () => {
    const [fila] = construirFilasOferta([seccion({ horasSemanalesOferta: null, profesor: null })]);
    expect(fila.E).toBe(6);
    expect(fila.I).toBe('POR ASIGNAR');
    expect(fila.H).toBeNull();
  });

  it('la matrícula (Q) sale de la cohorte y no se rellena con el cupo por defecto si la oferta no la indicó', () => {
    const conCohorte = construirFilasOferta([seccion()])[0];
    const cohorteSinMatricula = construirFilasOferta([
      seccion({ cuposEstimados: 30, grupo: { ...seccion().grupo!, cantidadEstudiantes: null } }),
    ])[0];
    const sinCohorte = construirFilasOferta([seccion({ cuposEstimados: 25, grupo: null })])[0];
    expect(conCohorte.Q).toBe(32);
    expect(cohorteSinMatricula.Q).toBeNull();
    expect(sinCohorte.Q).toBe(25);
    expect(sinCohorte.F).toBe('KV-BO-RC-01-A-M-IGS-AP-101');
  });

  it('ordena por programa, trayecto, sección y unidad curricular', () => {
    const filas = construirFilasOferta([
      seccion({ codigoSeccion: 'B', unidadCurricular: { ...seccion().unidadCurricular, pfg: { codigo: 'PIU' } } }),
      seccion({ codigoSeccion: 'Z' }),
      seccion({ codigoSeccion: 'A' }),
    ]);
    expect(filas.map((f) => f.A)).toEqual(['IGS', 'IGS', 'PIU']);
  });

  it('el libro exportado conserva encabezado en fila 10, autofiltro A10:AC y se reimporta sin pérdidas', async () => {
    const original = [
      seccion(),
      seccion({
        codigoSeccion: 'KV-BO-CN-02-B-T-PIU-SC',
        turno: Turno.VESPERTINO,
        sede: { codigo: ALDEA_CVG_GOSH_CODIGO, nombre: 'Aldea CVG-GOSH', ejeMunicipal: 'RÍO CARONÍ' },
        unidadCurricular: { ...seccion().unidadCurricular, codigo: 'PIU-SC', nombre: 'Seminario de Contexto', trayecto: 0, tramo: 0, pfg: { codigo: 'PIU' } },
        grupo: { ...seccion().grupo!, codigo: 'KV BO-CN 02 B-T', codigoNormalizado: 'KV-BO-CN-02-B-T', trayecto: 0, tramo: 0, turno: Turno.VESPERTINO, estatus: 'APERTURA', ejeMunicipal: 'RÍO CARONÍ' },
        profesor: null,
      }),
    ];
    const buffer = await generarLibroOferta(
      { titulo: 'OFERTA DE CARGA HORARIA 2026-II', lineas: ['FECHA DE ENTREGA: 15-10-2026'] },
      construirFilasOferta(original),
      'OFERTA 2026-II'
    );

    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(buffer as unknown as ArrayBuffer);
    const hoja = libro.worksheets[0];
    expect(hoja.getRow(FILA_ENCABEZADO_OFERTA).getCell(1).value).toBe('PFG');
    expect(hoja.getRow(FILA_ENCABEZADO_OFERTA).getCell(29).value).toBe('OBSERVACIONES');
    expect(hoja.autoFilter).toBe('A10:AC12');
    expect(hoja.getCell('F8').value).toBe('OFERTA DE CARGA HORARIA 2026-II');

    const { filas } = await normalizarLibro(buffer);
    expect(filas.every((f) => f.errores.length === 0)).toBe(true);
    const [igs, piu] = filas;
    expect(igs).toMatchObject({
      pfgCodigo: 'IGS',
      grupoCodigo: 'KV-BO-RC-01-A-M',
      ucCodigo: 'IGS-AP-101',
      cedula: 'V-14123456',
      dedicacion: DedicacionDocente.DEDICACION_EXCLUSIVA,
      escalafon: 'AUXILIAR_DOCENTE',
      anioIngreso: 2008,
      anioConcurso: 2012,
      horas: 4,
      turno: Turno.MATUTINO,
      centroEstudio: 'CECSOTIL',
      ejeMunicipal: 'RÍO CAURA',
      sedeCodigo: SEDE_PRINCIPAL_CODIGO,
      aulaEspecializada: 'TALLER COMPUTACION',
    });
    expect(piu).toMatchObject({
      pfgCodigo: 'PIU',
      grupoCodigo: 'KV-BO-CN-02-B-T',
      trayecto: 0,
      tramo: 0,
      porAsignar: true,
      turno: Turno.VESPERTINO,
      estatus: 'APERTURA',
      sedeCodigo: ALDEA_CVG_GOSH_CODIGO,
    });
  });
});
