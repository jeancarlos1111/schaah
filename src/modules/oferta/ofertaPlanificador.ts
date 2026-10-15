import {
  DedicacionDocente,
  TipoPrograma,
  Turno,
} from '../../core/domain/enums';
import { evaluarNormativaDocente } from '../../core/domain/rules/dedicacionRules';
import {
  FilaOfertaNormalizada,
  HorarioObservado,
  PROGRAMAS_OFERTA,
  claveComparacion,
  codigoProgramaSahad,
  dividirNombreCompleto,
  generarCodigoUC,
} from '../../core/domain/rules/ofertaNormalizacion';
import { to12HourFormat } from '../../core/domain/rules/timeSlotUtils';

/** Estado actual de la base de datos relevante para conciliar la oferta. */
export interface CatalogoActual {
  programas: { codigo: string; nombre: string }[];
  unidades: { pfgCodigo: string; codigo: string; nombre: string }[];
  docentes: { cedula: string; nombres: string; apellidos: string }[];
  sedes: string[];
  centros: string[];
  grupos: { pfgCodigo: string; codigoNormalizado: string }[];
  secciones: string[];
}

export interface ProgramaPlan {
  codigo: string;
  codigoOferta: string;
  nombre: string;
  tipo: TipoPrograma;
  areaConocimiento: string;
  nuevo: boolean;
}

export interface UnidadPlan {
  pfgCodigo: string;
  codigo: string;
  nombre: string;
  trayecto: number | null;
  tramo: number | null;
  horas: number | null;
  esProyecto: boolean;
  esElectiva: boolean;
  codigoGenerado: boolean;
  nuevo: boolean;
}

export interface DocentePlan {
  cedula: string;
  nombres: string;
  apellidos: string;
  nombreCompleto: string;
  dedicacion: DedicacionDocente | null;
  escalafon: string | null;
  condicion: string | null;
  profesion: string | null;
  estudiosCuartoNivel: string | null;
  anioIngreso: number | null;
  anioConcurso: number | null;
  centroEstudio: string | null;
  sedeCodigo: string;
  horas: number;
  nuevo: boolean;
}

export interface GrupoPlan {
  clave: string;
  pfgCodigo: string;
  codigo: string;
  codigoNormalizado: string;
  sedeCodigo: string;
  trayecto: number | null;
  tramo: number | null;
  malla: string | null;
  turno: Turno;
  estatus: string | null;
  cantidadEstudiantes: number | null;
  seccionesAsesoria: number | null;
  nroEncuentros: number | null;
  ejeMunicipal: string | null;
  observaciones: string | null;
  asignaciones: number;
  nuevo: boolean;
}

export interface AsignacionPlan {
  fila: number;
  grupoClave: string;
  pfgCodigo: string;
  ucCodigo: string;
  ucNombre: string;
  cedula: string | null;
  docenteNombre: string | null;
  codigoSeccion: string;
  horas: number | null;
  turno: Turno;
  sedeCodigo: string;
  cupos: number;
  aulaEspecializada: string | null;
  observaciones: string | null;
  nueva: boolean;
}

export interface IncidenciaFila {
  fila: number;
  mensaje: string;
}

export interface SobrecargaDocente {
  cedula: string;
  nombre: string;
  dedicacion: DedicacionDocente;
  horas: number;
  maxHoras: number;
  mensaje: string;
}

export interface DedicacionInconsistente {
  cedula: string;
  nombre: string;
  valores: DedicacionDocente[];
  aplicada: DedicacionDocente;
}

export interface HorarioObservadoPlan extends HorarioObservado {
  fila: number;
  grupo: string;
  unidad: string;
  horaInicio12: string;
  horaFin12: string;
}

export interface ResumenPlanOferta {
  filasLeidas: number;
  filasValidas: number;
  filasConError: number;
  programasNuevos: number;
  unidadesNuevas: number;
  docentesNuevos: number;
  docentesExistentes: number;
  gruposNuevos: number;
  gruposExistentes: number;
  asignacionesNuevas: number;
  asignacionesExistentes: number;
  asignacionesSinDocente: number;
  sedesNuevas: number;
}

export interface PlanImportacionOferta {
  programas: ProgramaPlan[];
  unidades: UnidadPlan[];
  docentes: DocentePlan[];
  grupos: GrupoPlan[];
  asignaciones: AsignacionPlan[];
  sedesNuevas: string[];
  centros: string[];
  errores: IncidenciaFila[];
  avisos: IncidenciaFila[];
  sobrecargas: SobrecargaDocente[];
  dedicacionesInconsistentes: DedicacionInconsistente[];
  horariosObservados: HorarioObservadoPlan[];
  resumen: ResumenPlanOferta;
}

const CUPOS_POR_DEFECTO = 30;

function claveNombre(nombre: string): string {
  return claveComparacion(nombre).replace(/[^A-Z ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function masFrecuente<T>(valores: T[]): T {
  const conteo = new Map<T, number>();
  for (const v of valores) conteo.set(v, (conteo.get(v) ?? 0) + 1);
  let mejor = valores[0];
  let max = 0;
  for (const [v, n] of conteo) {
    if (n > max) {
      mejor = v;
      max = n;
    }
  }
  return mejor;
}

/**
 * Concilia las filas normalizadas de la oferta con el catálogo vigente y produce el plan
 * idempotente de altas/actualizaciones, junto con las incidencias normativas (H-04, RC-06).
 */
export function planificarImportacion(
  filas: FilaOfertaNormalizada[],
  catalogo: CatalogoActual
): PlanImportacionOferta {
  const errores: IncidenciaFila[] = [];
  const avisos: IncidenciaFila[] = [];
  const validas: FilaOfertaNormalizada[] = [];

  for (const f of filas) {
    f.avisos.forEach((mensaje) => avisos.push({ fila: f.fila, mensaje }));
    if (f.errores.length > 0) {
      f.errores.forEach((mensaje) => errores.push({ fila: f.fila, mensaje }));
    } else {
      validas.push(f);
    }
  }

  // Programas
  const programasExistentes = new Set(catalogo.programas.map((p) => p.codigo));
  const programas = new Map<string, ProgramaPlan>();
  for (const f of validas) {
    const codigoOferta = f.pfgCodigo!;
    const codigo = codigoProgramaSahad(codigoOferta);
    if (programas.has(codigo)) continue;
    const info = PROGRAMAS_OFERTA[codigoOferta];
    programas.set(codigo, {
      codigo,
      codigoOferta,
      nombre: info?.nombre ?? `Programa ${codigoOferta}`,
      tipo: f.tipoPrograma,
      areaConocimiento: info?.areaConocimiento ?? 'Por definir',
      nuevo: !programasExistentes.has(codigo),
    });
  }

  // Unidades curriculares
  const unidadesExistentes = new Map<string, string>();
  const codigoPorNombre = new Map<string, string>();
  for (const u of catalogo.unidades) {
    unidadesExistentes.set(`${u.pfgCodigo}|${u.codigo}`, u.nombre);
    codigoPorNombre.set(`${u.pfgCodigo}|${claveNombre(u.nombre)}`, u.codigo);
  }
  const unidades = new Map<string, UnidadPlan>();
  const nombresDistintosAvisados = new Set<string>();

  for (const f of validas.filter((x) => x.ucCodigo)) {
    const pfg = codigoProgramaSahad(f.pfgCodigo!);
    const clave = `${pfg}|${f.ucCodigo}`;
    const previa = unidades.get(clave);
    if (previa) {
      if (claveNombre(previa.nombre) !== claveNombre(f.ucNombre) && !nombresDistintosAvisados.has(clave)) {
        nombresDistintosAvisados.add(clave);
        avisos.push({
          fila: f.fila,
          mensaje: `El código ${f.ucCodigo} se usa con otro nombre ("${f.ucNombre}"); se conserva "${previa.nombre}".`,
        });
      }
      continue;
    }
    unidades.set(clave, {
      pfgCodigo: pfg,
      codigo: f.ucCodigo!,
      nombre: unidadesExistentes.get(clave) ?? f.ucNombre,
      trayecto: f.trayecto,
      tramo: f.tramo,
      horas: f.horas,
      esProyecto: f.esProyecto,
      esElectiva: f.esElectiva,
      codigoGenerado: false,
      nuevo: !unidadesExistentes.has(clave),
    });
    const claveNom = `${pfg}|${claveNombre(f.ucNombre)}`;
    if (!codigoPorNombre.has(claveNom)) codigoPorNombre.set(claveNom, f.ucCodigo!);
  }

  const codigoUcPorFila = new Map<number, string>();
  for (const f of validas) {
    const pfg = codigoProgramaSahad(f.pfgCodigo!);
    if (f.ucCodigo) {
      codigoUcPorFila.set(f.fila, f.ucCodigo);
      continue;
    }
    const claveNom = `${pfg}|${claveNombre(f.ucNombre)}`;
    let codigo = codigoPorNombre.get(claveNom);
    if (!codigo) {
      const base = generarCodigoUC(f.pfgCodigo!, f.ucNombre);
      codigo = base;
      for (let n = 2; unidades.has(`${pfg}|${codigo}`) || unidadesExistentes.has(`${pfg}|${codigo}`); n++) {
        codigo = `${base}-${n}`;
      }
      codigoPorNombre.set(claveNom, codigo);
      unidades.set(`${pfg}|${codigo}`, {
        pfgCodigo: pfg,
        codigo,
        nombre: f.ucNombre,
        trayecto: f.trayecto,
        tramo: f.tramo,
        horas: f.horas,
        esProyecto: f.esProyecto,
        esElectiva: f.esElectiva,
        codigoGenerado: true,
        nuevo: true,
      });
    } else if (!unidades.has(`${pfg}|${codigo}`)) {
      unidades.set(`${pfg}|${codigo}`, {
        pfgCodigo: pfg,
        codigo,
        nombre: unidadesExistentes.get(`${pfg}|${codigo}`) ?? f.ucNombre,
        trayecto: f.trayecto,
        tramo: f.tramo,
        horas: f.horas,
        esProyecto: f.esProyecto,
        esElectiva: f.esElectiva,
        codigoGenerado: false,
        nuevo: !unidadesExistentes.has(`${pfg}|${codigo}`),
      });
    }
    codigoUcPorFila.set(f.fila, codigo);
  }

  // Docentes: cédula directa o identificación por nombre completo
  const cedulaPorNombre = new Map<string, string>();
  for (const d of catalogo.docentes) {
    cedulaPorNombre.set(claveNombre(`${d.nombres} ${d.apellidos}`), d.cedula);
  }
  for (const f of validas) {
    if (f.cedula && f.docenteNombre) cedulaPorNombre.set(claveNombre(f.docenteNombre), f.cedula);
  }

  const cedulaPorFila = new Map<number, string | null>();
  for (const f of validas) {
    if (f.cedula) {
      cedulaPorFila.set(f.fila, f.cedula);
    } else if (f.docenteNombre) {
      const encontrada = cedulaPorNombre.get(claveNombre(f.docenteNombre)) ?? null;
      cedulaPorFila.set(f.fila, encontrada);
      avisos.push({
        fila: f.fila,
        mensaje: encontrada
          ? `Docente "${f.docenteNombre}" identificado por nombre (cédula ${encontrada}).`
          : `Docente "${f.docenteNombre}" sin cédula ni coincidencia por nombre; la asignación queda por asignar.`,
      });
    } else {
      cedulaPorFila.set(f.fila, null);
    }
  }

  const docentesExistentes = new Set(catalogo.docentes.map((d) => d.cedula));
  const filasPorDocente = new Map<string, FilaOfertaNormalizada[]>();
  for (const f of validas) {
    const cedula = cedulaPorFila.get(f.fila);
    if (!cedula) continue;
    const lista = filasPorDocente.get(cedula) ?? [];
    lista.push(f);
    filasPorDocente.set(cedula, lista);
  }

  const primero = <T>(lista: FilaOfertaNormalizada[], campo: (f: FilaOfertaNormalizada) => T | null): T | null => {
    for (const f of lista) {
      const v = campo(f);
      if (v !== null && v !== undefined) return v;
    }
    return null;
  };

  const docentes: DocentePlan[] = [];
  const dedicacionesInconsistentes: DedicacionInconsistente[] = [];
  const sobrecargas: SobrecargaDocente[] = [];

  for (const [cedula, lista] of filasPorDocente) {
    const nombreCompleto = primero(lista, (f) => f.docenteNombre) ?? cedula;
    const { nombres, apellidos } = dividirNombreCompleto(nombreCompleto);
    const dedicaciones = lista.map((f) => f.dedicacion).filter((d): d is DedicacionDocente => d !== null);
    const distintas = [...new Set(dedicaciones)];
    const dedicacion = dedicaciones.length > 0 ? masFrecuente(dedicaciones) : null;
    if (distintas.length > 1 && dedicacion) {
      dedicacionesInconsistentes.push({ cedula, nombre: nombreCompleto, valores: distintas, aplicada: dedicacion });
    }

    const horas = lista.reduce((acc, f) => acc + (f.horas ?? 0), 0);
    if (dedicacion) {
      const evaluacion = evaluarNormativaDocente(dedicacion, horas);
      if (evaluacion.estado === 'SOBRECARGA') {
        sobrecargas.push({
          cedula,
          nombre: nombreCompleto,
          dedicacion,
          horas,
          maxHoras: evaluacion.maxHoras,
          mensaje: evaluacion.mensaje,
        });
      }
    }

    docentes.push({
      cedula,
      nombres: nombres || nombreCompleto,
      apellidos,
      nombreCompleto,
      dedicacion,
      escalafon: primero(lista, (f) => f.escalafon),
      condicion: primero(lista, (f) => f.condicion),
      profesion: primero(lista, (f) => f.profesion),
      estudiosCuartoNivel: primero(lista, (f) => f.estudiosCuartoNivel),
      anioIngreso: primero(lista, (f) => f.anioIngreso),
      anioConcurso: primero(lista, (f) => f.anioConcurso),
      centroEstudio: primero(lista, (f) => f.centroEstudio),
      sedeCodigo: masFrecuente(lista.map((f) => f.sedeCodigo)),
      horas,
      nuevo: !docentesExistentes.has(cedula),
    });
  }

  // Grupos (cohortes)
  const gruposExistentes = new Set(catalogo.grupos.map((g) => `${g.pfgCodigo}|${g.codigoNormalizado}`));
  const grupos = new Map<string, GrupoPlan>();
  for (const f of validas) {
    const pfg = codigoProgramaSahad(f.pfgCodigo!);
    const clave = `${pfg}|${f.grupoCodigo}`;
    const g = grupos.get(clave);
    if (!g) {
      grupos.set(clave, {
        clave,
        pfgCodigo: pfg,
        codigo: f.grupoCodigoOriginal,
        codigoNormalizado: f.grupoCodigo,
        sedeCodigo: f.sedeCodigo,
        trayecto: f.trayecto,
        tramo: f.tramo,
        malla: f.malla,
        turno: f.turno,
        estatus: f.estatus,
        cantidadEstudiantes: f.cantidadEstudiantes,
        seccionesAsesoria: f.seccionesAsesoria,
        nroEncuentros: f.nroEncuentros,
        ejeMunicipal: f.ejeMunicipal,
        observaciones: f.observaciones,
        asignaciones: 1,
        nuevo: !gruposExistentes.has(clave),
      });
      continue;
    }
    g.asignaciones++;
    g.trayecto ??= f.trayecto;
    g.tramo ??= f.tramo;
    g.malla ??= f.malla;
    g.estatus ??= f.estatus;
    g.cantidadEstudiantes ??= f.cantidadEstudiantes;
    g.seccionesAsesoria ??= f.seccionesAsesoria;
    g.nroEncuentros ??= f.nroEncuentros;
    g.ejeMunicipal ??= f.ejeMunicipal;
  }

  // Asignaciones UC + docente dentro de cada grupo
  const seccionesExistentes = new Set(catalogo.secciones);
  const codigosUsados = new Map<string, number>();
  const asignaciones: AsignacionPlan[] = [];
  const horariosObservados: HorarioObservadoPlan[] = [];

  for (const f of validas) {
    const pfg = codigoProgramaSahad(f.pfgCodigo!);
    const ucCodigo = codigoUcPorFila.get(f.fila)!;
    const grupo = grupos.get(`${pfg}|${f.grupoCodigo}`)!;
    const base = `${f.grupoCodigo}-${ucCodigo}`;
    const usos = (codigosUsados.get(base) ?? 0) + 1;
    codigosUsados.set(base, usos);
    const codigoSeccion = usos === 1 ? base : `${base}-${usos}`;
    if (usos > 1) {
      avisos.push({
        fila: f.fila,
        mensaje: `La unidad ${ucCodigo} aparece ${usos} veces en la sección ${f.grupoCodigo}; se registra como ${codigoSeccion}.`,
      });
    }

    const cedula = cedulaPorFila.get(f.fila) ?? null;
    const observaciones =
      !cedula && f.docenteNombre
        ? [f.observaciones, `Docente indicado en la oferta sin cédula: ${f.docenteNombre}`].filter(Boolean).join(' | ')
        : f.observaciones;

    asignaciones.push({
      fila: f.fila,
      grupoClave: grupo.clave,
      pfgCodigo: pfg,
      ucCodigo,
      ucNombre: f.ucNombre,
      cedula,
      docenteNombre: f.docenteNombre,
      codigoSeccion,
      horas: f.horas,
      turno: f.turno,
      sedeCodigo: grupo.sedeCodigo,
      cupos: f.cantidadEstudiantes ?? grupo.cantidadEstudiantes ?? CUPOS_POR_DEFECTO,
      aulaEspecializada: f.aulaEspecializada,
      observaciones,
      nueva: !seccionesExistentes.has(codigoSeccion),
    });

    if (f.horarioObservado) {
      horariosObservados.push({
        fila: f.fila,
        grupo: f.grupoCodigo,
        unidad: f.ucNombre,
        ...f.horarioObservado,
        horaInicio12: to12HourFormat(f.horarioObservado.horaInicio),
        horaFin12: to12HourFormat(f.horarioObservado.horaFin),
      });
    }
  }

  const sedesExistentes = new Set(catalogo.sedes);
  const sedesNuevas = [
    ...new Set([...grupos.values()].map((g) => g.sedeCodigo).concat(docentes.map((d) => d.sedeCodigo))),
  ].filter((s) => !sedesExistentes.has(s));

  const centros = [...new Set(docentes.map((d) => d.centroEstudio).filter((c): c is string => !!c))];

  const listaGrupos = [...grupos.values()];
  return {
    programas: [...programas.values()],
    unidades: [...unidades.values()],
    docentes,
    grupos: listaGrupos,
    asignaciones,
    sedesNuevas,
    centros,
    errores,
    avisos,
    sobrecargas: sobrecargas.sort((a, b) => b.horas - a.horas),
    dedicacionesInconsistentes,
    horariosObservados,
    resumen: {
      filasLeidas: filas.length,
      filasValidas: validas.length,
      filasConError: filas.length - validas.length,
      programasNuevos: [...programas.values()].filter((p) => p.nuevo).length,
      unidadesNuevas: [...unidades.values()].filter((u) => u.nuevo).length,
      docentesNuevos: docentes.filter((d) => d.nuevo).length,
      docentesExistentes: docentes.filter((d) => !d.nuevo).length,
      gruposNuevos: listaGrupos.filter((g) => g.nuevo).length,
      gruposExistentes: listaGrupos.filter((g) => !g.nuevo).length,
      asignacionesNuevas: asignaciones.filter((a) => a.nueva).length,
      asignacionesExistentes: asignaciones.filter((a) => !a.nueva).length,
      asignacionesSinDocente: asignaciones.filter((a) => !a.cedula).length,
      sedesNuevas: sedesNuevas.length,
    },
  };
}
