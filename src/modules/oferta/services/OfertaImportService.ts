import { PrismaClient } from '@prisma/client';
import prismaDefault from '../../../core/database/prisma';
import { TipoEspacio } from '../../../core/domain/enums';
import { LIMITES_DEDICACION } from '../../../core/domain/rules/dedicacionRules';
import {
  ALDEA_CVG_GOSH_CODIGO,
  ALDEA_GRAN_SABANA_CODIGO,
  CENTROS_ESTUDIO_UBV,
  SEDE_PRINCIPAL_CODIGO,
  normalizarFilaOferta,
} from '../../../core/domain/rules/ofertaNormalizacion';
import { LibroOfertaLeido, leerLibroOferta } from '../ofertaExcel';
import { CatalogoActual, PlanImportacionOferta, planificarImportacion } from '../ofertaPlanificador';

export const EJE_TERRITORIAL_BOLIVAR = 'Eje Geopolítico Territorial Kerepakupai Vena';

const SEDES_OFERTA: Record<string, { nombre: string; ejeMunicipal: string; esAldea: boolean }> = {
  [SEDE_PRINCIPAL_CODIGO]: { nombre: 'Sede UBV Bolívar - Ciudad Bolívar', ejeMunicipal: 'RÍO CAURA', esAldea: false },
  [ALDEA_CVG_GOSH_CODIGO]: { nombre: 'Aldea Universitaria CVG-GOSH (Puerto Ordaz)', ejeMunicipal: 'RÍO CARONÍ', esAldea: true },
  [ALDEA_GRAN_SABANA_CODIGO]: { nombre: 'Aldea Universitaria Santa Elena de Uairén', ejeMunicipal: 'INDIO PEMÓN', esAldea: true },
};

export interface AnalisisOferta {
  libro: Omit<LibroOfertaLeido, 'filas'> & { totalFilas: number };
  plan: PlanImportacionOferta;
}

export interface ResultadoAplicacionOferta {
  programasCreados: number;
  unidadesCreadas: number;
  docentesCreados: number;
  docentesActualizados: number;
  dedicacionesRegistradas: number;
  gruposCreados: number;
  gruposActualizados: number;
  seccionesCreadas: number;
  seccionesActualizadas: number;
  sedesCreadas: number;
  centrosCreados: number;
}

export interface OrigenImportacion {
  nombreArchivo: string;
  usuarioNombre: string;
}

export class OfertaImportService {
  constructor(private readonly prisma: PrismaClient = prismaDefault) {}

  async cargarCatalogo(periodoId: string): Promise<CatalogoActual> {
    const [programas, unidades, docentes, sedes, centros, grupos, secciones] = await Promise.all([
      this.prisma.programaFormacion.findMany({ select: { codigo: true, nombre: true } }),
      this.prisma.unidadCurricular.findMany({ select: { codigo: true, nombre: true, pfg: { select: { codigo: true } } } }),
      this.prisma.profesor.findMany({ select: { cedula: true, nombres: true, apellidos: true } }),
      this.prisma.sede.findMany({ select: { codigo: true } }),
      this.prisma.centroEstudio.findMany({ select: { codigo: true } }),
      this.prisma.grupoSeccion.findMany({
        where: { periodoId },
        select: { codigoNormalizado: true, pfg: { select: { codigo: true } } },
      }),
      this.prisma.seccion.findMany({ where: { periodoId }, select: { codigoSeccion: true } }),
    ]);

    return {
      programas,
      unidades: unidades.map((u) => ({ pfgCodigo: u.pfg.codigo, codigo: u.codigo, nombre: u.nombre })),
      docentes,
      sedes: sedes.map((s) => s.codigo),
      centros: centros.map((c) => c.codigo),
      grupos: grupos.map((g) => ({ pfgCodigo: g.pfg.codigo, codigoNormalizado: g.codigoNormalizado })),
      secciones: secciones.map((s) => s.codigoSeccion),
    };
  }

  async analizarArchivo(buffer: Buffer, periodoId: string): Promise<AnalisisOferta> {
    const libro = await leerLibroOferta(buffer);
    const filas = libro.filas.map((f) => normalizarFilaOferta(f.numero, f.celdas));
    const plan = planificarImportacion(filas, await this.cargarCatalogo(periodoId));
    const { filas: leidas, ...resto } = libro;
    return { libro: { ...resto, totalFilas: leidas.length }, plan };
  }

  /** Aplica el plan de forma transaccional e idempotente (upsert por claves naturales). */
  async aplicarPlan(
    plan: PlanImportacionOferta,
    periodoId: string,
    origen: OrigenImportacion = { nombreArchivo: 'oferta.xlsx', usuarioNombre: 'Sistema' }
  ): Promise<ResultadoAplicacionOferta> {
    const resultado: ResultadoAplicacionOferta = {
      programasCreados: 0,
      unidadesCreadas: 0,
      docentesCreados: 0,
      docentesActualizados: 0,
      dedicacionesRegistradas: 0,
      gruposCreados: 0,
      gruposActualizados: 0,
      seccionesCreadas: 0,
      seccionesActualizadas: 0,
      sedesCreadas: 0,
      centrosCreados: 0,
    };

    await this.prisma.$transaction(
      async (tx) => {
        const periodo = await tx.periodoAcademico.findUnique({ where: { id: periodoId } });
        if (!periodo) throw new Error('El período académico indicado no existe.');

        // Sedes y centros de estudio
        const sedeId = new Map<string, string>();
        for (const s of await tx.sede.findMany({ select: { id: true, codigo: true } })) sedeId.set(s.codigo, s.id);
        for (const codigo of plan.sedesNuevas) {
          const info = SEDES_OFERTA[codigo] ?? { nombre: codigo, ejeMunicipal: null, esAldea: true };
          const sede = await tx.sede.create({
            data: {
              codigo,
              nombre: info.nombre,
              ejeTerritorial: EJE_TERRITORIAL_BOLIVAR,
              ejeMunicipal: info.ejeMunicipal,
              esAldeaMunicipalizada: info.esAldea,
            },
          });
          sedeId.set(codigo, sede.id);
          resultado.sedesCreadas++;
        }

        const centroId = new Map<string, string>();
        for (const codigo of plan.centros) {
          const existente = await tx.centroEstudio.findUnique({ where: { codigo } });
          const centro =
            existente ??
            (await tx.centroEstudio.create({ data: { codigo, nombre: CENTROS_ESTUDIO_UBV[codigo] ?? codigo } }));
          if (!existente) resultado.centrosCreados++;
          centroId.set(codigo, centro.id);
        }

        // Programas
        const pfgId = new Map<string, string>();
        for (const p of plan.programas) {
          const existente = await tx.programaFormacion.findUnique({ where: { codigo: p.codigo } });
          const programa =
            existente ??
            (await tx.programaFormacion.create({
              data: { codigo: p.codigo, nombre: p.nombre, tipo: p.tipo, areaConocimiento: p.areaConocimiento },
            }));
          if (!existente) resultado.programasCreados++;
          pfgId.set(p.codigo, programa.id);
        }

        // Unidades curriculares
        const ucId = new Map<string, string>();
        for (const u of plan.unidades) {
          const programaId = pfgId.get(u.pfgCodigo)!;
          const existente = await tx.unidadCurricular.findUnique({
            where: { pfgId_codigo: { pfgId: programaId, codigo: u.codigo } },
          });
          const horas = u.horas ?? 0;
          const unidad =
            existente ??
            (await tx.unidadCurricular.create({
              data: {
                pfgId: programaId,
                codigo: u.codigo,
                nombre: u.nombre,
                trayecto: u.trayecto,
                tramo: u.tramo,
                creditos: horas,
                horasTeoricasSemanales: u.esProyecto ? 0 : horas,
                horasCampoComunitarioSemanales: u.esProyecto ? horas : 0,
                tipoEspacioRequerido: u.esProyecto ? TipoEspacio.ESPACIO_COMUNITARIO_CAMPO : TipoEspacio.AULA_TEORICA,
                esProyectoComunitario: u.esProyecto,
                esElectiva: u.esElectiva,
                codigoProvisional: u.codigoGenerado,
              },
            }));
          if (!existente) resultado.unidadesCreadas++;
          ucId.set(`${u.pfgCodigo}|${u.codigo}`, unidad.id);
        }

        // Docentes y dedicación del período
        const profesorId = new Map<string, string>();
        for (const d of plan.docentes) {
          const datosOferta = {
            ...(d.escalafon ? { escalafon: d.escalafon } : {}),
            ...(d.condicion ? { condicion: d.condicion } : {}),
            ...(d.profesion ? { profesion: d.profesion } : {}),
            ...(d.estudiosCuartoNivel ? { estudiosCuartoNivel: d.estudiosCuartoNivel } : {}),
            ...(d.anioIngreso ? { anioIngreso: d.anioIngreso } : {}),
            ...(d.anioConcurso ? { anioConcurso: d.anioConcurso } : {}),
            ...(d.centroEstudio ? { centroEstudioId: centroId.get(d.centroEstudio) } : {}),
          };
          const existente = await tx.profesor.findUnique({ where: { cedula: d.cedula } });
          const profesor = existente
            ? await tx.profesor.update({ where: { id: existente.id }, data: datosOferta })
            : await tx.profesor.create({
                data: { cedula: d.cedula, nombres: d.nombres, apellidos: d.apellidos, ...datosOferta },
              });
          if (existente) resultado.docentesActualizados++;
          else resultado.docentesCreados++;
          profesorId.set(d.cedula, profesor.id);

          if (d.dedicacion) {
            const limites = LIMITES_DEDICACION[d.dedicacion];
            const datosDedicacion = {
              dedicacion: d.dedicacion,
              horasPermanenciaSemanales: limites.maxPermanencia,
              minHorasDocenciaDirecta: limites.minDocencia,
              maxHorasDocenciaDirecta: limites.maxDocencia,
              sedeAdscripcionPrincipalId: sedeId.get(d.sedeCodigo)!,
            };
            await tx.profesorDedicacion.upsert({
              where: { profesorId_periodoId: { profesorId: profesor.id, periodoId } },
              update: datosDedicacion,
              create: { profesorId: profesor.id, periodoId, ...datosDedicacion },
            });
            resultado.dedicacionesRegistradas++;
          }
        }

        // Grupos (cohortes)
        const grupoId = new Map<string, string>();
        for (const g of plan.grupos) {
          const programaId = pfgId.get(g.pfgCodigo)!;
          const datos = {
            codigo: g.codigo,
            sedeId: sedeId.get(g.sedeCodigo)!,
            trayecto: g.trayecto,
            tramo: g.tramo,
            malla: g.malla,
            turno: g.turno,
            estatus: g.estatus,
            cantidadEstudiantes: g.cantidadEstudiantes,
            seccionesAsesoria: g.seccionesAsesoria,
            nroEncuentros: g.nroEncuentros,
            ejeMunicipal: g.ejeMunicipal,
            observaciones: g.observaciones,
          };
          const clave = { periodoId, pfgId: programaId, codigoNormalizado: g.codigoNormalizado };
          const existente = await tx.grupoSeccion.findUnique({ where: { periodoId_pfgId_codigoNormalizado: clave } });
          const grupo = existente
            ? await tx.grupoSeccion.update({ where: { id: existente.id }, data: datos })
            : await tx.grupoSeccion.create({ data: { ...clave, ...datos } });
          if (existente) resultado.gruposActualizados++;
          else resultado.gruposCreados++;
          grupoId.set(g.clave, grupo.id);
        }

        // Asignaciones UC + docente
        for (const a of plan.asignaciones) {
          const datos = {
            grupoId: grupoId.get(a.grupoClave)!,
            unidadCurricularId: ucId.get(`${a.pfgCodigo}|${a.ucCodigo}`)!,
            sedeId: sedeId.get(a.sedeCodigo)!,
            profesorId: a.cedula ? profesorId.get(a.cedula) ?? null : null,
            turno: a.turno,
            cuposEstimados: a.cupos,
            horasSemanalesOferta: a.horas,
            aulaEspecializada: a.aulaEspecializada,
            observaciones: a.observaciones,
          };
          const existente = await tx.seccion.findUnique({
            where: { periodoId_codigoSeccion: { periodoId, codigoSeccion: a.codigoSeccion } },
          });
          if (existente) {
            await tx.seccion.update({ where: { id: existente.id }, data: datos });
            resultado.seccionesActualizadas++;
          } else {
            await tx.seccion.create({ data: { periodoId, codigoSeccion: a.codigoSeccion, ...datos } });
            resultado.seccionesCreadas++;
          }
        }

        await tx.importacionOferta.create({
          data: {
            periodoId,
            nombreArchivo: origen.nombreArchivo,
            usuarioNombre: origen.usuarioNombre,
            resumen: JSON.stringify({ plan: plan.resumen, aplicado: resultado }),
            dedicacionesInconsistentes: JSON.stringify(plan.dedicacionesInconsistentes),
            errores: JSON.stringify(plan.errores),
          },
        });
      },
      { timeout: 120_000, maxWait: 10_000 }
    );

    return resultado;
  }
}
