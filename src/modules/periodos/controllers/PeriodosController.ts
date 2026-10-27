import { Request, Response } from 'express';
import prisma from '../../../core/database/prisma';
import { EstatusGrupo, MallaGrupo, RolUsuario, Turno } from '../../../core/domain/enums';
import {
  calcularCargaDocente,
  evaluarNormativaDocente,
  horasDocenciaSeccion,
} from '../../../core/domain/rules/dedicacionRules';
import { validarPertenenciaSeccionUC } from '../../../core/domain/rules/curriculoRules';
import {
  inferirTurnoDesdeCodigoGrupo,
  normalizarCodigoGrupo,
  normalizarEjeMunicipal,
} from '../../../core/domain/rules/ofertaNormalizacion';
import { urlRetornoSecciones } from '../urlRetorno';
import { filtroPfg, filtroPfgEfectivo, puedeGestionarPfg, puedeProgramarHorarios } from '../../../core/domain/rules/alcancePfgRules';
import { alcanceDe, denegarPfg } from '../../auth/middlewares/alcancePfg';
import { validarAccesoPiso, etiquetaPiso } from '../../../core/domain/rules/pisoRules';
import {
  puedeRegistrarOferta,
  validarTransicionEstadoPeriodo,
  validarPrerrequisitosApertura,
} from '../../../core/domain/rules/ofertaWorkflowRules';
import { AuditService } from '../../../core/audit/auditService';

function enteroOpcional(valor: unknown): number | null {
  const n = parseInt(String(valor ?? ''), 10);
  return Number.isNaN(n) ? null : n;
}

export const AVISO_DOCENTE_PERIODOS =
  'La gestión de períodos y secciones corresponde a la planificación; se muestra su horario.';

/** El docente no gestiona períodos ni secciones: se le lleva a su horario conservando cualquier error recibido. */
function redirigirDocenteASuHorario(req: Request, res: Response, destino: string): boolean {
  if (req.session?.usuario?.rol !== RolUsuario.DOCENTE) return false;
  const error = typeof req.query.error === 'string' && req.query.error ? req.query.error : '';
  const aviso = error ? `error=${encodeURIComponent(error)}` : `msg=${encodeURIComponent(AVISO_DOCENTE_PERIODOS)}`;
  res.redirect(`${destino}?${aviso}`);
  return true;
}

export class PeriodosController {
  /**
   * Listado de períodos académicos con SahadDataTable server-side y métricas Bento (Spec 07)
   */
  static async index(req: Request, res: Response) {
    try {
      if (redirigirDocenteASuHorario(req, res, '/horarios')) return;
      const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 10));
      const skip = (page - 1) * limit;

      const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
      const estadoParam = typeof req.query.estado === 'string' ? req.query.estado.trim() : '';
      const sortBy = typeof req.query.sortBy === 'string' ? req.query.sortBy.trim() : 'codigo';
      const sortDir = req.query.sortDir === 'desc' ? 'desc' : 'asc';

      const validSortColumns = ['codigo', 'nombre', 'fechaInicio', 'fechaFin', 'estado', 'createdAt'];
      const activeSortBy = validSortColumns.includes(sortBy) ? sortBy : 'codigo';

      const where: any = {};
      if (estadoParam) {
        where.estado = estadoParam;
      }
      if (q) {
        where.OR = [
          { codigo: { contains: q } },
          { nombre: { contains: q } },
        ];
      }

      // Spec 06: el coordinador solo cuenta las secciones de sus programas
      const pfgAlcance = filtroPfg(alcanceDe(req));
      const whereSeccionesAlcance = pfgAlcance ? { unidadCurricular: { pfgId: pfgAlcance } } : {};

      const [totalFiltrados, periodos, totalPeriodos, totalActivos, totalSecciones, totalDedicaciones] = await Promise.all([
        prisma.periodoAcademico.count({ where }),
        prisma.periodoAcademico.findMany({
          where,
          include: {
            _count: {
              select: {
                secciones: { where: whereSeccionesAlcance },
                dedicaciones: true,
                disponibilidades: true,
              },
            },
          },
          orderBy: { [activeSortBy]: sortDir },
          skip,
          take: limit,
        }),
        prisma.periodoAcademico.count(),
        prisma.periodoAcademico.count({ where: { estado: 'ACTIVO' } }),
        prisma.seccion.count({ where: whereSeccionesAlcance }),
        prisma.profesorDedicacion.count(),
      ]);

      // Métricas de cobertura por cada período en la página
      const periodosConMetricas = await Promise.all(
        periodos.map(async (p) => {
          const seccionesAsignadas = await prisma.seccion.count({
            where: {
              ...whereSeccionesAlcance,
              periodoId: p.id,
              profesorId: { not: null },
            },
          });
          const totalSec = p._count.secciones;
          const porcentaje = totalSec > 0 ? Math.round((seccionesAsignadas / totalSec) * 100) : 0;
          return {
            ...p,
            seccionesAsignadas,
            porcentajeAsignado: porcentaje,
          };
        })
      );

      const totalPages = Math.ceil(totalFiltrados / limit) || 1;

      res.render('pages/periodos/index', {
        title: 'Períodos Académicos',
        periodos: periodosConMetricas,
        pagination: {
          page,
          limit,
          total: totalFiltrados,
          totalPages,
          start: totalFiltrados === 0 ? 0 : skip + 1,
          end: Math.min(skip + limit, totalFiltrados),
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
        filters: {
          q,
          estado: estadoParam,
          sortBy: activeSortBy,
          sortDir,
        },
        stats: {
          totalPeriodos,
          totalActivos,
          totalSecciones,
          totalDedicaciones,
        },
        mensaje: req.query.msg || null,
        error: req.query.error || null,
      });
    } catch (err) {
      console.error('[PERIODOS-INDEX-ERROR]', err);
      res.render('pages/periodos/index', {
        title: 'Períodos Académicos',
        periodos: [],
        pagination: {
          page: 1,
          limit: 10,
          total: 0,
          totalPages: 1,
          start: 0,
          end: 0,
          hasNextPage: false,
          hasPrevPage: false,
        },
        filters: { q: '', estado: '', sortBy: 'codigo', sortDir: 'asc' },
        stats: { totalPeriodos: 0, totalActivos: 0, totalSecciones: 0, totalDedicaciones: 0 },
        mensaje: null,
        error: 'Error al cargar los períodos académicos.',
      });
    }
  }

  /**
   * Crear nuevo período académico
   */
  static async crearPeriodo(req: Request, res: Response) {
    try {
      const { codigo, nombre, fechaInicio, fechaFin, estado } = req.body;

      if (!codigo || !nombre || !fechaInicio || !fechaFin) {
        return res.redirect('/periodos?error=' + encodeURIComponent('Todos los campos son obligatorios.'));
      }

      const existe = await prisma.periodoAcademico.findUnique({
        where: { codigo: codigo.trim().toUpperCase() },
      });

      if (existe) {
        return res.redirect('/periodos?error=' + encodeURIComponent(`El período "${codigo}" ya se encuentra registrado.`));
      }

      await prisma.periodoAcademico.create({
        data: {
          codigo: codigo.trim().toUpperCase(),
          nombre: nombre.trim(),
          fechaInicio: new Date(fechaInicio),
          fechaFin: new Date(fechaFin),
          estado: estado || 'BORRADOR',
        },
      });

      return res.redirect('/periodos?msg=' + encodeURIComponent(`Período ${codigo} creado exitosamente.`));
    } catch (err: any) {
      console.error('[CREAR-PERIODO-ERROR]', err);
      return res.redirect('/periodos?error=' + encodeURIComponent(err.message || 'Error al crear período.'));
    }
  }

  /**
   * Actualizar estado del período
   */
  static async cambiarEstado(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { estado } = req.body;

      const periodoActual = await prisma.periodoAcademico.findUnique({ where: { id } });
      if (!periodoActual) {
        return res.redirect('/periodos?error=' + encodeURIComponent('Período académico no encontrado.'));
      }

      const validacionTransicion = validarTransicionEstadoPeriodo(
        periodoActual.estado,
        estado,
        req.session?.usuario?.rol
      );
      if (!validacionTransicion.valido) {
        return res.redirect('/periodos?error=' + encodeURIComponent(validacionTransicion.error || 'Transición de estado no autorizada.'));
      }

      // Si se abre la ventana de registro de ofertas, comprobar prerrequisitos institucionales
      const nuevoEstadoNorm = estado.trim().toUpperCase();
      if (nuevoEstadoNorm === 'REGISTRO_OFERTAS' || nuevoEstadoNorm === 'PLANIFICACION') {
        const [docentesActivos, espaciosActivos, unidadesCurricularesActivas] = await Promise.all([
          prisma.profesor.count({ where: { activo: true } }),
          prisma.espacioFisico.count({ where: { activo: true } }),
          prisma.unidadCurricular.count({ where: { activa: true } }),
        ]);

        const prereq = validarPrerrequisitosApertura({
          docentesActivos,
          espaciosActivos,
          unidadesCurricularesActivas,
        });

        if (!prereq.listo) {
          return res.redirect(
            '/periodos?error=' +
              encodeURIComponent(`No se puede abrir la oferta académica. Prerrequisitos incompletos: ${prereq.detalles.join(' ')}`)
          );
        }
      }

      await prisma.periodoAcademico.update({
        where: { id },
        data: { estado },
      });

      const actor = req.session?.usuario;
      await AuditService.registrar({
        usuarioId: actor?.id,
        usuarioEmail: actor?.email ?? 'sistema',
        usuarioNombre: `${actor?.nombres ?? ''} ${actor?.apellidos ?? ''}`.trim() || 'Sistema',
        rol: actor?.rol ?? 'ADMINISTRADOR',
        accion: 'EDITAR',
        entidad: 'PERIODO',
        entidadId: id,
        detalles: `Cambio de estado del período a ${estado}`,
        datosAnteriores: { estado: periodoActual.estado },
        datosNuevos: { estado },
        ip: req.ip,
      });

      return res.redirect('/periodos?msg=' + encodeURIComponent(`Estado del período actualizado a ${estado}.`));
    } catch (err: any) {
      console.error('[ESTADO-PERIODO-ERROR]', err);
      return res.redirect('/periodos?error=' + encodeURIComponent(err.message || 'No se pudo actualizar el estado.'));
    }
  }

  /**
   * Panel de gestión de oferta académica y secciones de un período con SahadDataTable server-side (Spec 07)
   */
  static async secciones(req: Request, res: Response) {
    try {
      const { id: periodoId } = req.params;
      if (redirigirDocenteASuHorario(req, res, `/periodos/${encodeURIComponent(periodoId)}/horarios`)) return;

      const periodo = await prisma.periodoAcademico.findUnique({
        where: { id: periodoId },
      });

      if (!periodo) {
        return res.redirect('/periodos?error=' + encodeURIComponent('Período académico no encontrado.'));
      }

      const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 10));
      const skip = (page - 1) * limit;

      const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
      const pfgIdParam = typeof req.query.pfgId === 'string' ? req.query.pfgId.trim() : '';
      const turnoParam = typeof req.query.turno === 'string' ? req.query.turno.trim() : '';
      const sedeIdParam = typeof req.query.sedeId === 'string' ? req.query.sedeId.trim() : '';
      const docenteParam = typeof req.query.docente === 'string' ? req.query.docente.trim() : ''; // 'CON_DOCENTE' | 'VACANTE'
      const grupoIdParam = typeof req.query.grupoId === 'string' ? req.query.grupoId.trim() : '';
      const sortBy = typeof req.query.sortBy === 'string' ? req.query.sortBy.trim() : 'codigoSeccion';
      const sortDir = req.query.sortDir === 'desc' ? 'desc' : 'asc';

      const validSortColumns = ['codigoSeccion', 'turno', 'cuposEstimados', 'createdAt'];
      const activeSortBy = validSortColumns.includes(sortBy) ? sortBy : 'codigoSeccion';

      // Spec 06: el coordinador solo ve las asignaciones de sus programas
      const alcance = alcanceDe(req);
      const pfgAlcance = filtroPfg(alcance);
      const whereAlcance: any = { periodoId };
      if (pfgAlcance) whereAlcance.unidadCurricular = { pfgId: pfgAlcance };
      const pfgFiltro = filtroPfgEfectivo(alcance, pfgIdParam);

      // Construcción dinámica de la cláusula WHERE (Spec 07)
      const where: any = {
        periodoId,
      };

      if (turnoParam) {
        where.turno = turnoParam;
      }
      if (grupoIdParam) {
        where.grupoId = grupoIdParam;
      }
      if (sedeIdParam) {
        where.sedeId = sedeIdParam;
      }
      if (pfgFiltro) {
        where.unidadCurricular = {
          pfgId: pfgFiltro,
        };
      }
      if (docenteParam === 'CON_DOCENTE') {
        where.profesorId = { not: null };
      } else if (docenteParam === 'VACANTE') {
        where.profesorId = null;
      }

      if (q) {
        where.OR = [
          { codigoSeccion: { contains: q } },
          { grupo: { codigoNormalizado: { contains: q.toUpperCase() } } },
          { unidadCurricular: { nombre: { contains: q } } },
          { unidadCurricular: { codigo: { contains: q } } },
          { profesor: { nombres: { contains: q } } },
          { profesor: { apellidos: { contains: q } } },
          { profesor: { cedula: { contains: q } } },
        ];
      }

      const [
        totalFiltrados,
        secciones,
        totalSecciones,
        conDocente,
        sinDocente,
        cuposTotalesAgg,
        pfgs,
        sedes,
        profesores,
        grupos,
      ] = await Promise.all([
        prisma.seccion.count({ where }),
        prisma.seccion.findMany({
          where,
          include: {
            unidadCurricular: {
              include: { pfg: true },
            },
            grupo: { select: { id: true, codigo: true, codigoNormalizado: true } },
            sede: true,
            profesor: {
              include: {
                dedicaciones: {
                  where: { periodoId },
                },
              },
            },
            horarios: {
              include: { espacioFisico: true },
            },
          },
          orderBy: { [activeSortBy]: sortDir },
          skip,
          take: limit,
        }),
        prisma.seccion.count({ where: whereAlcance }),
        prisma.seccion.count({ where: { ...whereAlcance, profesorId: { not: null } } }),
        prisma.seccion.count({ where: { ...whereAlcance, profesorId: null } }),
        prisma.seccion.aggregate({
          where: whereAlcance,
          _sum: { cuposEstimados: true },
        }),
        prisma.programaFormacion.findMany({
          where: { activo: true, id: pfgAlcance },
          include: {
            unidadesCurriculares: {
              where: { activa: true },
              orderBy: [{ trayecto: 'asc' }, { tramo: 'asc' }, { codigo: 'asc' }],
            },
          },
          orderBy: { nombre: 'asc' },
        }),
        prisma.sede.findMany({
          where: { activa: true },
          orderBy: { nombre: 'asc' },
        }),
        prisma.profesor.findMany({
          where: { activo: true },
          include: {
            dedicaciones: {
              where: { periodoId },
            },
            pfgAdscripcion: true,
          },
          orderBy: [{ apellidos: 'asc' }, { nombres: 'asc' }],
        }),
        prisma.grupoSeccion.findMany({
          where: { periodoId, pfgId: pfgAlcance },
          include: { pfg: { select: { codigo: true } } },
          orderBy: { codigoNormalizado: 'asc' },
        }),
      ]);

      const asignacionesConDocente = await prisma.seccion.findMany({
        where: { periodoId, profesorId: { not: null } },
        select: {
          profesorId: true,
          horasSemanalesOferta: true,
          unidadCurricular: { select: { horasTeoricasSemanales: true, horasPracticasSemanales: true } },
        },
      });
      const asignacionesPorDocente = new Map<string, typeof asignacionesConDocente>();
      asignacionesConDocente.forEach((a) => {
        const lista = asignacionesPorDocente.get(a.profesorId!) ?? [];
        lista.push(a);
        asignacionesPorDocente.set(a.profesorId!, lista);
      });
      const docentesCarga = profesores.map((p) => {
        const carga = calcularCargaDocente(p.dedicaciones[0]?.dedicacion ?? null, asignacionesPorDocente.get(p.id) ?? []);
        const horasDisponibles = carga.disponibles;
        return {
          id: p.id,
          nombre: `${p.apellidos}, ${p.nombres}`,
          cedula: p.cedula,
          pfgAdscripcionId: p.pfgAdscripcionId,
          pfgAdscripcionCodigo: p.pfgAdscripcion?.codigo || null,
          pfgAdscripcionNombre: p.pfgAdscripcion?.nombre || null,
          pisoMaximo: p.pisoMaximo,
          motivoRestriccionPiso: p.motivoRestriccionPiso,
          diasDisponibles: p.diasDisponibles ? JSON.parse(p.diasDisponibles) : [],
          horasDisponibles,
          ...carga,
        };
      });

      const totalPages = Math.ceil(totalFiltrados / limit) || 1;

      res.render('pages/periodos/secciones', {
        title: `Oferta Académica - ${periodo.codigo}`,
        periodo,
        puedeModificarOferta: puedeRegistrarOferta(periodo.estado, req.session?.usuario?.rol),
        puedeModificarHorarios: puedeProgramarHorarios(req.session?.usuario?.rol),
        secciones,
        pfgs,
        sedes,
        profesores,
        docentesCarga,
        urlActual: req.originalUrl,
        grupos,
        turnos: Object.values(Turno),
        mallas: Object.values(MallaGrupo),
        estatusGrupo: Object.values(EstatusGrupo),
        pagination: {
          page,
          limit,
          total: totalFiltrados,
          totalPages,
          start: totalFiltrados === 0 ? 0 : skip + 1,
          end: Math.min(skip + limit, totalFiltrados),
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
        filters: {
          q,
          pfgId: typeof pfgFiltro === 'string' ? pfgFiltro : '',
          turno: turnoParam,
          sedeId: sedeIdParam,
          docente: docenteParam,
          grupoId: grupoIdParam,
          sortBy: activeSortBy,
          sortDir,
        },
        stats: {
          totalSecciones,
          conDocente,
          sinDocente,
          totalCupos: cuposTotalesAgg._sum.cuposEstimados || 0,
        },
        mensaje: req.query.msg || null,
        error: req.query.error || null,
      });
    } catch (err) {
      console.error('[SECCIONES-INDEX-ERROR]', err);
      res.redirect('/periodos?error=' + encodeURIComponent('Error al cargar la oferta de secciones.'));
    }
  }

  /**
   * Crear nueva sección para un período
   */
  static async crearSeccion(req: Request, res: Response) {
    const { id: periodoId } = req.params;
    try {
      const periodo = await prisma.periodoAcademico.findUnique({
        where: { id: periodoId },
      });
      if (!periodo) {
        return res.redirect('/periodos?error=' + encodeURIComponent('Período académico no encontrado.'));
      }

      if (!puedeRegistrarOferta(periodo.estado, req.session?.usuario?.rol)) {
        return res.redirect(
          `/periodos/${periodoId}/secciones?error=` +
            encodeURIComponent(`La ventana de oferta académica está cerrada (Estado: ${periodo.estado}). No se pueden agregar secciones.`)
        );
      }
      const {
        pfgId,
        unidadCurricularId,
        sedeId,
        profesorId,
        codigoSeccion,
        turno,
        cuposEstimados,
        grupoId,
        horasSemanalesOferta,
      } = req.body;

      if (!unidadCurricularId || !sedeId || !codigoSeccion) {
        return res.redirect(
          `/periodos/${periodoId}/secciones?error=` +
            encodeURIComponent('Unidad Curricular, Sede y Código de Sección son campos obligatorios.')
        );
      }

      // RC-02: Validar existencia de la UC y pertenencia al PFG
      const uc = await prisma.unidadCurricular.findUnique({
        where: { id: unidadCurricularId },
      });

      if (!uc) {
        return res.redirect(
          `/periodos/${periodoId}/secciones?error=` +
            encodeURIComponent('La Unidad Curricular seleccionada no existe.')
        );
      }

      if (!puedeGestionarPfg(alcanceDe(req), uc.pfgId)) {
        return denegarPfg(req, res);
      }

      if (pfgId) {
        const valPertenencia = validarPertenenciaSeccionUC(pfgId, uc.pfgId);
        if (!valPertenencia.valido) {
          return res.redirect(
            `/periodos/${periodoId}/secciones?error=` +
              encodeURIComponent(valPertenencia.error || 'Violación de pertenencia curricular RC-02.')
          );
        }
      }

      const grupo = grupoId
        ? await prisma.grupoSeccion.findFirst({ where: { id: grupoId, periodoId } })
        : null;
      if (grupoId && !grupo) {
        return res.redirect(
          `/periodos/${periodoId}/secciones?error=` +
            encodeURIComponent('La sección (cohorte) seleccionada no pertenece a este período.')
        );
      }
      if (grupo) {
        const valGrupo = validarPertenenciaSeccionUC(grupo.pfgId, uc.pfgId);
        if (!valGrupo.valido) {
          return res.redirect(
            `/periodos/${periodoId}/secciones?error=` +
              encodeURIComponent(
                'Violación RC-02: la unidad curricular no pertenece al programa de la sección (cohorte) seleccionada.'
              )
          );
        }
      }

      // Validar unicidad dentro del período
      const existente = await prisma.seccion.findFirst({
        where: {
          periodoId,
          codigoSeccion: codigoSeccion.trim().toUpperCase(),
        },
      });

      if (existente) {
        return res.redirect(
          `/periodos/${periodoId}/secciones?error=` +
            encodeURIComponent(`La sección con código "${codigoSeccion}" ya existe en este período.`)
        );
      }

      await prisma.seccion.create({
        data: {
          periodoId,
          unidadCurricularId,
          sedeId: grupo ? grupo.sedeId : sedeId,
          grupoId: grupo ? grupo.id : null,
          profesorId: profesorId ? profesorId : null,
          codigoSeccion: codigoSeccion.trim().toUpperCase(),
          turno: turno || grupo?.turno || 'MATUTINO',
          cuposEstimados: parseInt(cuposEstimados, 10) || grupo?.cantidadEstudiantes || 30,
          horasSemanalesOferta: enteroOpcional(horasSemanalesOferta),
        },
      });

      return res.redirect(
        `/periodos/${periodoId}/secciones?msg=` +
          encodeURIComponent(`Sección ${codigoSeccion} registrada exitosamente.`)
      );
    } catch (err: any) {
      console.error('[CREAR-SECCION-ERROR]', err);
      return res.redirect(
        `/periodos/${periodoId}/secciones?error=` +
          encodeURIComponent(err.message || 'Error al registrar la sección.')
      );
    }
  }

  /**
   * Registrar una sección (cohorte de estudiantes) que agrupa varias unidades curriculares
   */
  static async crearGrupo(req: Request, res: Response) {
    const { id: periodoId } = req.params;
    try {
      const periodo = await prisma.periodoAcademico.findUnique({
        where: { id: periodoId },
      });
      if (!periodo) {
        return res.redirect('/periodos?error=' + encodeURIComponent('Período académico no encontrado.'));
      }

      if (!puedeRegistrarOferta(periodo.estado, req.session?.usuario?.rol)) {
        return res.redirect(
          `/periodos/${periodoId}/secciones?error=` +
            encodeURIComponent(`La ventana de oferta académica está cerrada (Estado: ${periodo.estado}). No se pueden registrar cohortes.`)
        );
      }

      const { pfgId, sedeId, codigo, trayecto, tramo, malla, turno, estatus, cantidadEstudiantes, ejeMunicipal, observaciones } =
        req.body;

      const codigoNormalizado = normalizarCodigoGrupo(codigo);
      if (!pfgId || !sedeId || !codigoNormalizado) {
        return res.redirect(
          `/periodos/${periodoId}/secciones?error=` +
            encodeURIComponent('Programa, sede y código de la sección son obligatorios.')
        );
      }

      if (!puedeGestionarPfg(alcanceDe(req), pfgId)) {
        return denegarPfg(req, res);
      }

      const existente = await prisma.grupoSeccion.findUnique({
        where: { periodoId_pfgId_codigoNormalizado: { periodoId, pfgId, codigoNormalizado } },
      });
      if (existente) {
        return res.redirect(
          `/periodos/${periodoId}/secciones?error=` +
            encodeURIComponent(`La sección ${codigoNormalizado} ya existe para ese programa en este período.`)
        );
      }

      const turnoValido = (Object.values(Turno) as string[]).includes(turno) ? turno : null;
      const grupo = await prisma.grupoSeccion.create({
        data: {
          periodoId,
          pfgId,
          sedeId,
          codigo: String(codigo).trim(),
          codigoNormalizado,
          trayecto: enteroOpcional(trayecto),
          tramo: enteroOpcional(tramo),
          malla: (Object.values(MallaGrupo) as string[]).includes(malla) ? malla : null,
          turno: turnoValido ?? inferirTurnoDesdeCodigoGrupo(codigoNormalizado) ?? Turno.MATUTINO,
          estatus: (Object.values(EstatusGrupo) as string[]).includes(estatus) ? estatus : null,
          cantidadEstudiantes: enteroOpcional(cantidadEstudiantes),
          ejeMunicipal: normalizarEjeMunicipal(ejeMunicipal),
          observaciones: observaciones ? String(observaciones).trim() : null,
        },
      });

      return res.redirect(
        `/periodos/${periodoId}/secciones?grupoId=${grupo.id}&msg=` +
          encodeURIComponent(`Sección ${codigoNormalizado} registrada. Agregue sus unidades curriculares con "Nueva Asignación".`)
      );
    } catch (err: any) {
      console.error('[CREAR-GRUPO-ERROR]', err);
      return res.redirect(
        `/periodos/${periodoId}/secciones?error=` + encodeURIComponent(err.message || 'Error al registrar la sección.')
      );
    }
  }

  /**
   * Asignar o remover docente de una sección con validación H-04
   */
  static async asignarDocente(req: Request, res: Response) {
    const { id: periodoId, seccionId } = req.params;
    try {
      const { profesorId, volver } = req.body;

      const periodo = await prisma.periodoAcademico.findUnique({ where: { id: periodoId } });
      if (periodo && !puedeRegistrarOferta(periodo.estado, req.session?.usuario?.rol)) {
        return res.redirect(
          urlRetornoSecciones(
            periodoId,
            volver,
            'error',
            `La ventana de oferta académica está cerrada (Estado: ${periodo.estado}). No se puede modificar la asignación docente.`
          )
        );
      }

      const profId = profesorId && profesorId.trim() !== '' ? profesorId.trim() : null;

      const seccionDestino = await prisma.seccion.findFirst({
        where: { id: seccionId, periodoId },
        include: {
          unidadCurricular: true,
          horarios: {
            include: { espacioFisico: true },
          },
        },
      });
      if (!seccionDestino) {
        return res.redirect(
          urlRetornoSecciones(periodoId, volver, 'error', 'La asignación indicada no pertenece a este período.')
        );
      }
      if (!puedeGestionarPfg(alcanceDe(req), seccionDestino.unidadCurricular.pfgId)) {
        return denegarPfg(req, res);
      }

      // Si se está asignando un docente, verificar restricciones de piso y tope H-04
      if (profId) {
        const docente = await prisma.profesor.findUnique({
          where: { id: profId },
        });

        if (docente && docente.pisoMaximo !== null && docente.pisoMaximo !== undefined) {
          for (const hor of seccionDestino.horarios) {
            if (hor.espacioFisico) {
              const pisoAula = hor.espacioFisico.pisoNivel ?? hor.espacioFisico.piso;
              if (!validarAccesoPiso(docente.pisoMaximo, pisoAula)) {
                return res.redirect(
                  urlRetornoSecciones(
                    periodoId,
                    volver,
                    'error',
                    `Restricción de movilidad (Piso): El docente tiene asignado piso máx ${etiquetaPiso(docente.pisoMaximo)} (${docente.motivoRestriccionPiso || 'condición física'}) y el horario está en aula ${hor.espacioFisico.nombre} (${etiquetaPiso(pisoAula)}).`
                  )
                );
              }
            }
          }
        }
        const dedicacion = await prisma.profesorDedicacion.findUnique({
          where: {
            profesorId_periodoId: {
              profesorId: profId,
              periodoId,
            },
          },
        });

        if (dedicacion) {
          const seccionesAsignadas = await prisma.seccion.findMany({
            where: {
              periodoId,
              profesorId: profId,
              id: { not: seccionId },
            },
            include: { unidadCurricular: true },
          });

          const horasActuales = seccionesAsignadas.reduce((acc, s) => acc + horasDocenciaSeccion(s), 0);
          const horasNuevas = horasDocenciaSeccion(seccionDestino);

          const totalProyectado = horasActuales + horasNuevas;

          const evaluacion = evaluarNormativaDocente(dedicacion.dedicacion, totalProyectado);
          if (evaluacion.estado === 'SOBRECARGA') {
            return res.redirect(
              urlRetornoSecciones(
                periodoId,
                volver,
                'error',
                `Violación de H-04: Asignar esta sección elevaría la carga a ${totalProyectado}h (Tope legal: ${dedicacion.maxHorasDocenciaDirecta}h para ${dedicacion.dedicacion}).`
              )
            );
          }
        }
      }

      await prisma.seccion.update({
        where: { id: seccionId },
        data: { profesorId: profId },
      });

      return res.redirect(urlRetornoSecciones(periodoId, volver, 'msg', 'Asignación docente actualizada exitosamente.'));
    } catch (err: any) {
      console.error('[ASIGNAR-DOCENTE-ERROR]', err);
      return res.redirect(
        urlRetornoSecciones(periodoId, req.body?.volver, 'error', err.message || 'Error al actualizar asignación.')
      );
    }
  }

  /**
   * Eliminar sección si no tiene horarios asignados
   */
  static async eliminarSeccion(req: Request, res: Response) {
    const { id: periodoId, seccionId } = req.params;
    try {
      const periodo = await prisma.periodoAcademico.findUnique({ where: { id: periodoId } });
      if (periodo && !puedeRegistrarOferta(periodo.estado, req.session?.usuario?.rol)) {
        return res.redirect(
          `/periodos/${periodoId}/secciones?error=` +
            encodeURIComponent(`La ventana de oferta académica está cerrada (Estado: ${periodo.estado}). No se pueden eliminar secciones.`)
        );
      }

      const seccion = await prisma.seccion.findFirst({ where: { id: seccionId, periodoId }, select: { id: true } });
      if (!seccion) {
        return res.redirect(
          `/periodos/${periodoId}/secciones?error=` +
            encodeURIComponent('La asignación indicada no pertenece a este período.')
        );
      }

      const horariosCount = await prisma.horarioSeccion.count({
        where: { seccionId },
      });

      if (horariosCount > 0) {
        return res.redirect(
          `/periodos/${periodoId}/secciones?error=` +
            encodeURIComponent('No se puede eliminar la sección porque ya tiene bloques de horario programados.')
        );
      }

      await prisma.seccion.delete({
        where: { id: seccionId },
      });

      return res.redirect(
        `/periodos/${periodoId}/secciones?msg=` +
          encodeURIComponent('Sección eliminada del período.')
      );
    } catch (err: any) {
      console.error('[ELIMINAR-SECCION-ERROR]', err);
      return res.redirect(
        `/periodos/${periodoId}/secciones?error=` +
          encodeURIComponent('Error al eliminar sección.')
      );
    }
  }
}
