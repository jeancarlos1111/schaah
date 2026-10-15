import { describe, it, expect } from 'vitest';
import {
  CondicionLaboral,
  DedicacionDocente,
  EscalafonDocente,
  EstatusGrupo,
  MallaGrupo,
  TipoPrograma,
  Turno,
} from '../../src/core/domain/enums';
import {
  ALDEA_CVG_GOSH_CODIGO,
  ALDEA_GRAN_SABANA_CODIGO,
  SEDE_PRINCIPAL_CODIGO,
  dividirNombreCompleto,
  esDocentePorAsignar,
  extraerHorarioObservacion,
  generarCodigoUC,
  inferirTipoPrograma,
  inferirTurnoDesdeCodigoGrupo,
  normalizarAldea,
  normalizarAulaEspecializada,
  normalizarCedula,
  normalizarCentroEstudio,
  normalizarCodigoGrupo,
  normalizarCodigoPrograma,
  normalizarCodigoUC,
  normalizarCondicion,
  normalizarDedicacion,
  normalizarEjeMunicipal,
  normalizarEscalafon,
  normalizarEstatus,
  normalizarFilaOferta,
  normalizarMalla,
  normalizarTrayectoTramo,
  normalizarTurno,
  romanoAEntero,
  serialExcelAAnio,
} from '../../src/core/domain/rules/ofertaNormalizacion';
import { horasDocenciaSeccion } from '../../src/core/domain/rules/dedicacionRules';

describe('Normalización de la Oferta de Carga Horaria (Excel UBV 2026-II)', () => {
  describe('Dedicación docente', () => {
    it('unifica todas las variantes de tipeo de Exclusiva observadas en la hoja', () => {
      for (const v of ['EXCLUSIVA', 'Exclusivo', 'EXclusivo', 'exclusiva', 'EXCLUSIVO', 'Exlusivo', 'Exlusiva']) {
        expect(normalizarDedicacion(v)).toBe(DedicacionDocente.DEDICACION_EXCLUSIVA);
      }
    });

    it('reconoce Tiempo Completo, Medio Tiempo (incluso "MEDIÓ TIEMPO") y Convencional', () => {
      expect(normalizarDedicacion('TIEMPO COMPLETO')).toBe(DedicacionDocente.TIEMPO_COMPLETO);
      expect(normalizarDedicacion('Tiempo completo')).toBe(DedicacionDocente.TIEMPO_COMPLETO);
      expect(normalizarDedicacion('MEDIÓ TIEMPO')).toBe(DedicacionDocente.MEDIO_TIEMPO);
      expect(normalizarDedicacion('medio tiempo')).toBe(DedicacionDocente.MEDIO_TIEMPO);
      expect(normalizarDedicacion('convencional')).toBe(DedicacionDocente.TIEMPO_CONVENCIONAL);
    });

    it('retorna null para celdas vacías o valores no reconocidos', () => {
      expect(normalizarDedicacion('')).toBeNull();
      expect(normalizarDedicacion(null)).toBeNull();
      expect(normalizarDedicacion('INSTRUCTOR')).toBeNull();
    });
  });

  describe('Escalafón y condición', () => {
    it('normaliza escalafones incluyendo femeninos, minúsculas y Auxiliar Docente', () => {
      expect(normalizarEscalafon('AGREGADA')).toBe(EscalafonDocente.AGREGADO);
      expect(normalizarEscalafon('titular')).toBe(EscalafonDocente.TITULAR);
      expect(normalizarEscalafon('instructor')).toBe(EscalafonDocente.INSTRUCTOR);
      expect(normalizarEscalafon('AUXILIAR DOCENTE 1')).toBe(EscalafonDocente.AUXILIAR_DOCENTE);
      expect(normalizarEscalafon('AUX. DOCENTE')).toBe(EscalafonDocente.AUXILIAR_DOCENTE);
      expect(normalizarEscalafon('AUX DOCENTE I')).toBe(EscalafonDocente.AUXILIAR_DOCENTE);
      expect(normalizarEscalafon('2007')).toBeNull();
      expect(normalizarEscalafon('TIEMPO COMPLETO')).toBeNull();
    });

    it('normaliza condiciones con errores de tipeo reales', () => {
      expect(normalizarCondicion('ORDINARIA')).toBe(CondicionLaboral.ORDINARIO);
      expect(normalizarCondicion('ORDINARIOS')).toBe(CondicionLaboral.ORDINARIO);
      for (const v of ['CONTRATADA', 'contrttada', 'contratrda', 'contatrado', 'contratada']) {
        expect(normalizarCondicion(v)).toBe(CondicionLaboral.CONTRATADO);
      }
      expect(normalizarCondicion('POR CONTRATAR')).toBe(CondicionLaboral.POR_CONTRATAR);
      expect(normalizarCondicion('MEDIO TIEMPO')).toBeNull();
    });
  });

  describe('Cédula y nombres', () => {
    it('produce cédulas canónicas V-######## y descarta valores inválidos', () => {
      expect(normalizarCedula('4595529')).toBe('V-4595529');
      expect(normalizarCedula(13251943)).toBe('V-13251943');
      expect(normalizarCedula('V-12.602.043')).toBe('V-12602043');
      expect(normalizarCedula('')).toBeNull();
      expect(normalizarCedula('123')).toBeNull();
    });

    it('detecta docentes por asignar', () => {
      expect(esDocentePorAsignar('POR ASIGNAR')).toBe(true);
      expect(esDocentePorAsignar('')).toBe(true);
      expect(esDocentePorAsignar('JESUS BONALDE')).toBe(false);
    });

    it('divide nombres y apellidos respetando iniciales', () => {
      expect(dividirNombreCompleto('JESUS BONALDE')).toEqual({ nombres: 'Jesus', apellidos: 'Bonalde' });
      expect(dividirNombreCompleto('FELSON ALFONSO LUGO BOLIVAR')).toEqual({
        nombres: 'Felson Alfonso',
        apellidos: 'Lugo Bolivar',
      });
      expect(dividirNombreCompleto('FELIX M. VARGAS')).toEqual({ nombres: 'Felix M.', apellidos: 'Vargas' });
    });
  });

  describe('Trayectos, tramos y años', () => {
    it('convierte números romanos, dígitos e INTRODUCTORIO', () => {
      expect(romanoAEntero('VIII')).toBe(8);
      expect(romanoAEntero('IV')).toBe(4);
      expect(romanoAEntero('III')).toBe(3);
      expect(romanoAEntero('X')).toBe(10);
      expect(romanoAEntero('2')).toBe(2);
      expect(romanoAEntero(5)).toBe(5);
      expect(romanoAEntero('INTRODUCTORIO')).toBe(0);
      expect(romanoAEntero('')).toBeNull();
      expect(romanoAEntero('ABC')).toBeNull();
    });

    it('convierte tramos relativos al trayecto en tramos correlativos (RC-06)', () => {
      expect(normalizarTrayectoTramo(4, 8)).toEqual({ trayecto: 4, tramo: 8, ajustado: false });
      expect(normalizarTrayectoTramo(1, 2)).toEqual({ trayecto: 1, tramo: 2, ajustado: false });
      expect(normalizarTrayectoTramo(3, 1)).toEqual({ trayecto: 3, tramo: 5, ajustado: true });
      expect(normalizarTrayectoTramo(2, 2)).toEqual({ trayecto: 2, tramo: 4, ajustado: true });
      expect(normalizarTrayectoTramo(null, 6)).toEqual({ trayecto: 3, tramo: 6, ajustado: true });
      expect(normalizarTrayectoTramo(2, 9)).toEqual({ trayecto: 2, tramo: null, ajustado: true });
      expect(normalizarTrayectoTramo(0, 0)).toEqual({ trayecto: 0, tramo: 0, ajustado: false });
    });

    it('interpreta años, fechas seriales de Excel y errores de tipeo', () => {
      expect(serialExcelAAnio('2004')).toBe(2004);
      expect(serialExcelAAnio(2013)).toBe(2013);
      expect(serialExcelAAnio('45201')).toBe(2023);
      expect(serialExcelAAnio(43752)).toBe(2019);
      expect(serialExcelAAnio('38412')).toBe(2005);
      expect(serialExcelAAnio('2O19')).toBe(2019);
      expect(serialExcelAAnio('201|9')).toBe(2019);
      expect(serialExcelAAnio('202O')).toBe(2020);
      expect(serialExcelAAnio(new Date(Date.UTC(2011, 5, 1)))).toBe(2011);
    });

    it('descarta marcadores de "no concursó"', () => {
      for (const v of ['NO CONCURSO', 'NO', 'N/A', 'NA', 'NO HA CONCURSADO', 'X', '']) {
        expect(serialExcelAAnio(v)).toBeNull();
      }
      expect(serialExcelAAnio('20013')).toBeNull();
    });
  });

  describe('Programas y códigos de sección', () => {
    it('agrupa variantes de PNFEIC y limpia códigos compuestos', () => {
      expect(normalizarCodigoPrograma('PNFEIC-TRANSICION')).toBe('PNFEIC');
      expect(normalizarCodigoPrograma('PNFEIC-TRAN INTRO')).toBe('PNFEIC');
      expect(normalizarCodigoPrograma('PESC Y ACU')).toBe('PESC-ACU');
      expect(normalizarCodigoPrograma('EJ')).toBe('EJ');
      expect(normalizarCodigoPrograma('')).toBeNull();
    });

    it('infiere el tipo de programa', () => {
      expect(inferirTipoPrograma('PIU')).toBe(TipoPrograma.PIU);
      expect(inferirTipoPrograma('PFA')).toBe(TipoPrograma.PFA);
      expect(inferirTipoPrograma('IDIOMAS')).toBe(TipoPrograma.IDIOMAS);
      expect(inferirTipoPrograma('PNFEIC')).toBe(TipoPrograma.PNF);
      expect(inferirTipoPrograma('EJ')).toBe(TipoPrograma.PFG);
    });

    it('unifica las distintas escrituras de una misma sección', () => {
      const variantes = ['KV BO-RC 01 A-M  ', 'KV-BO-RC-01-A-M', 'KVBO-RC 01A-M', 'KV BO-RC 01 A M', 'KV BO – RC 1AM'];
      for (const v of variantes) {
        expect(normalizarCodigoGrupo(v)).toBe('KV-BO-RC-01-A-M');
      }
      expect(normalizarCodigoGrupo('KV-BO-RC-01-AT')).toBe('KV-BO-RC-01-A-T');
      expect(normalizarCodigoGrupo('KV-BO-SI-2-B-T')).toBe('KV-BO-SI-02-B-T');
      expect(normalizarCodigoGrupo('KRBO-RC-04 A-M')).toBe('KV-BO-RC-04-A-M');
      expect(normalizarCodigoGrupo('KV BO RCA – 04AM')).toBe('KV-BO-RCA-04-A-M');
    });

    it('conserva la forma de códigos no estándar (cohortes PFA, PNFEIC)', () => {
      expect(normalizarCodigoGrupo('SACN7-T1-HE')).toBe('SACN7-T1-HE');
      expect(normalizarCodigoGrupo('MCDE-cohorte 13')).toBe('MCDE-COHORTE-13');
      expect(normalizarCodigoGrupo('DCDE')).toBe('DCDE');
    });

    it('infiere el turno del sufijo del código canónico', () => {
      expect(inferirTurnoDesdeCodigoGrupo('KV-BO-RC-01-A-M')).toBe(Turno.MATUTINO);
      expect(inferirTurnoDesdeCodigoGrupo('KV-BO-RC-01-A-T')).toBe(Turno.VESPERTINO);
      expect(inferirTurnoDesdeCodigoGrupo('DCDE')).toBeNull();
    });

    it('descarta códigos de UC corridos desde la columna de turno y genera códigos sintéticos', () => {
      expect(normalizarCodigoUC('MAÑANA')).toBeNull();
      expect(normalizarCodigoUC('TARDE')).toBeNull();
      expect(normalizarCodigoUC('PRY-EJR-100')).toBe('PRY-EJR-100');
      expect(normalizarCodigoUC('GCH216TIV6')).toBe('GCH216TIV6');
      expect(generarCodigoUC('PIU', 'Lenguaje de Comunicación y Técnicas de Estudios')).toBe('PIU-LCTE');
      expect(generarCodigoUC('EJ', 'Trabajo Especial de Grado II')).toBe('EJ-TEGII');
    });
  });

  describe('Turno, malla y estatus', () => {
    it('normaliza turnos incluyendo Única y Fines de Semana', () => {
      expect(normalizarTurno('MAÑANA')).toBe(Turno.MATUTINO);
      expect(normalizarTurno('tarde')).toBe(Turno.VESPERTINO);
      expect(normalizarTurno('UNICA')).toBe(Turno.UNICA);
      expect(normalizarTurno('UNICS')).toBe(Turno.UNICA);
      expect(normalizarTurno('FINES DE SEMANA')).toBe(Turno.FIN_DE_SEMANA);
      expect(normalizarTurno('DIURNA')).toBeNull();
    });

    it('normaliza malla y estatus con variantes reales', () => {
      expect(normalizarMalla('D')).toBe(MallaGrupo.DIURNA);
      expect(normalizarMalla('DIURNO')).toBe(MallaGrupo.DIURNA);
      expect(normalizarMalla('NOCTURNO')).toBe(MallaGrupo.NOCTURNA);
      expect(normalizarEstatus('INICIA')).toBe(EstatusGrupo.APERTURA);
      expect(normalizarEstatus('APETURA')).toBe(EstatusGrupo.APERTURA);
      expect(normalizarEstatus('APERTURAN')).toBe(EstatusGrupo.APERTURA);
      expect(normalizarEstatus('ABRE')).toBe(EstatusGrupo.APERTURA);
      expect(normalizarEstatus('cierra')).toBe(EstatusGrupo.CIERRA);
      expect(normalizarEstatus('CIERRE')).toBe(EstatusGrupo.CIERRA);
      expect(normalizarEstatus('FINALIZA')).toBe(EstatusGrupo.FINALIZA);
      expect(normalizarEstatus('CONTINUA')).toBe(EstatusGrupo.CONTINUA);
      expect(normalizarEstatus('MAÑANA')).toBeNull();
    });
  });

  describe('Territorio y espacios', () => {
    it('normaliza centros de estudio y descarta valores que no son centros', () => {
      expect(normalizarCentroEstudio('CESyC')).toBe('CESYC');
      expect(normalizarCentroEstudio('CEPEEC')).toBe('CEPEC');
      expect(normalizarCentroEstudio('CESOTIL')).toBe('CECSOTIL');
      expect(normalizarCentroEstudio('CESACODEVI')).toBe('CESACODEVI');
      expect(normalizarCentroEstudio('NINGUNO')).toBeNull();
      expect(normalizarCentroEstudio('RIO CAURA')).toBeNull();
    });

    it('normaliza ejes municipales (EMRC = Río Caroní, usado por la aldea CVG-GOSH)', () => {
      expect(normalizarEjeMunicipal('RIO CAURA')).toBe('RÍO CAURA');
      expect(normalizarEjeMunicipal('EMRC')).toBe('RÍO CARONÍ');
      expect(normalizarEjeMunicipal('Rio caroni')).toBe('RÍO CARONÍ');
      expect(normalizarEjeMunicipal('Rio CARON')).toBe('RÍO CARONÍ');
      expect(normalizarEjeMunicipal('INDIO PEMON')).toBe('INDIO PEMÓN');
      expect(normalizarEjeMunicipal('KEREPAKUPAI VENA')).toBeNull();
    });

    it('asigna la sede SAHAD según la aldea', () => {
      expect(normalizarAldea('SEDE')).toBe(SEDE_PRINCIPAL_CODIGO);
      expect(normalizarAldea('SEDE CIUDAD BOLÍVAR')).toBe(SEDE_PRINCIPAL_CODIGO);
      expect(normalizarAldea('')).toBe(SEDE_PRINCIPAL_CODIGO);
      for (const v of ['CVG-GOSH', 'CVG GOSH', 'CVG-Gosh', 'GVG-GOSH']) {
        expect(normalizarAldea(v)).toBe(ALDEA_CVG_GOSH_CODIGO);
      }
      expect(normalizarAldea('GRAN SABANA')).toBe(ALDEA_GRAN_SABANA_CODIGO);
    });

    it('reconoce aulas especializadas y descarta valores corridos', () => {
      expect(normalizarAulaEspecializada('TALLER COMPUTACION')).toBe('TALLER COMPUTACION');
      expect(normalizarAulaEspecializada('MULTIMODAL')).toBe('MULTIMODAL');
      expect(normalizarAulaEspecializada('NO')).toBeNull();
      expect(normalizarAulaEspecializada('CIERRA')).toBeNull();
    });
  });

  describe('Observaciones con horario', () => {
    it('extrae día y horario civil convertido a 24h', () => {
      expect(extraerHorarioObservacion('MARTES 1:30 - 3:30')).toEqual({
        dia: 'MARTES',
        horaInicio: '13:30',
        horaFin: '15:30',
      });
      expect(extraerHorarioObservacion('MIÉRCOLES 3:30 - 5:30')).toEqual({
        dia: 'MIERCOLES',
        horaInicio: '15:30',
        horaFin: '17:30',
      });
      expect(extraerHorarioObservacion('JUEVES 9:45 - 12:00')).toEqual({
        dia: 'JUEVES',
        horaInicio: '09:45',
        horaFin: '12:00',
      });
      expect(extraerHorarioObservacion('CARGA LA NOTA')).toBeNull();
    });
  });

  describe('Fila completa', () => {
    it('normaliza una fila PIU real (fila 12 de la hoja)', () => {
      const fila = normalizarFilaOferta(12, {
        A: 'PIU', B: '1', C: '1', D: 'PROYECTO SOMOS UBV', E: '4', F: 'KV BO-RC 01 A-M  ',
        H: '13251943', I: 'DAYENI HERNANDEZ', J: 'EXCLUSIVA', K: 'AGREGADO', L: '2004', M: '2008',
        N: 'ORDINARIO', O: 'LIC. BIOLOGIA', P: 'MAESTRIA EN GERENCIA AMBIENTAL', R: 'DIURNA', S: 'MAÑANA',
        T: 'CIERRA', X: 'KEREPAKUPAI VENA', Z: 'CEA', AA: 'CEA', AB: 'SEDE',
      });

      expect(fila.errores).toEqual([]);
      expect(fila.pfgCodigo).toBe('PIU');
      expect(fila.tipoPrograma).toBe(TipoPrograma.PIU);
      expect(fila.trayecto).toBe(1);
      expect(fila.tramo).toBe(1);
      expect(fila.ucNombre).toBe('Proyecto Somos Ubv');
      expect(fila.ucCodigo).toBeNull();
      expect(fila.esProyecto).toBe(true);
      expect(fila.horas).toBe(4);
      expect(fila.grupoCodigo).toBe('KV-BO-RC-01-A-M');
      expect(fila.cedula).toBe('V-13251943');
      expect(fila.dedicacion).toBe(DedicacionDocente.DEDICACION_EXCLUSIVA);
      expect(fila.escalafon).toBe(EscalafonDocente.AGREGADO);
      expect(fila.condicion).toBe(CondicionLaboral.ORDINARIO);
      expect(fila.anioIngreso).toBe(2004);
      expect(fila.anioConcurso).toBe(2008);
      expect(fila.malla).toBe(MallaGrupo.DIURNA);
      expect(fila.turno).toBe(Turno.MATUTINO);
      expect(fila.estatus).toBe(EstatusGrupo.CIERRA);
      expect(fila.centroEstudio).toBe('CEA');
      expect(fila.ejeMunicipal).toBeNull();
      expect(fila.sedeCodigo).toBe(SEDE_PRINCIPAL_CODIGO);
    });

    it('tolera columnas corridas (fila 27: malla en TURNO, turno en ESTATUS, estatus en ASESORÍA)', () => {
      const fila = normalizarFilaOferta(27, {
        A: 'PIU', B: '1', C: '1', D: 'PROYECTO SOMOS UBV', E: '4', F: 'KV BO-RC 01 D-M  ',
        H: '13016669', I: 'SAMIRA MEDINA', J: 'EXCLUSIVA', K: 'TITULAR', S: 'DIURNA', T: 'MAÑANA', U: 'CONTINUA',
      });

      expect(fila.malla).toBe(MallaGrupo.DIURNA);
      expect(fila.turno).toBe(Turno.MATUTINO);
      expect(fila.estatus).toBe(EstatusGrupo.CONTINUA);
      expect(fila.seccionesAsesoria).toBeNull();
    });

    it('anula trayecto/tramo en IDIOMAS y PFA, y reporta filas sin datos clave', () => {
      const idiomas = normalizarFilaOferta(500, {
        A: 'IDIOMAS', D: 'PORTUGUÉS 2', E: '3', F: 'KV-BO-RC-2-A-T', G: 'IDM-POR-402', I: 'POR ASIGNAR',
      });
      expect(idiomas.tipoPrograma).toBe(TipoPrograma.IDIOMAS);
      expect(idiomas.trayecto).toBeNull();
      expect(idiomas.tramo).toBeNull();
      expect(idiomas.porAsignar).toBe(true);
      expect(idiomas.turno).toBe(Turno.VESPERTINO);

      const invalida = normalizarFilaOferta(900, { D: 'X' });
      expect(invalida.errores).toContain('Fila sin PFG/programa.');
      expect(invalida.errores).toContain('Fila sin código de sección.');
    });

    it('advierte trayectos fuera de rango y docentes sin cédula', () => {
      const fila = normalizarFilaOferta(40, {
        A: 'EJ', B: '7', C: '1', D: 'DERECHO PENAL', E: '4', F: 'KV BO-RC 01 A-M', I: 'JOSÉ LOZADA',
      });
      expect(fila.trayecto).toBeNull();
      expect(fila.avisos.some((a) => a.includes('Trayecto 7'))).toBe(true);
      expect(fila.avisos.some((a) => a.includes('sin cédula'))).toBe(true);
    });
  });

  describe('Cómputo de horas de docencia por asignación', () => {
    it('las horas de la oferta prevalecen sobre HT+HP de la malla', () => {
      const uc = { horasTeoricasSemanales: 2, horasPracticasSemanales: 2 };
      expect(horasDocenciaSeccion({ horasSemanalesOferta: 6, unidadCurricular: uc })).toBe(6);
      expect(horasDocenciaSeccion({ horasSemanalesOferta: null, unidadCurricular: uc })).toBe(4);
      expect(horasDocenciaSeccion({ unidadCurricular: uc })).toBe(4);
    });
  });
});
