import { Request, Response } from 'express';
import prisma from '../../../core/database/prisma';
import { Turno } from '../../../core/domain/enums';
import { evaluarNormativaDocente } from '../../../core/domain/rules/dedicacionRules';

export class PeriodosController {
  /**
   * Listado de períodos académicos con SchaahDataTable server-side y métricas Bento (Spec 07)
   */
  static async index(req: Request, res: Response) {
    try {
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

      const [totalFiltrados, periodos, totalPeriodos, totalActivos, totalSecciones, totalDedicaciones] = await Promise.all([
        prisma.periodoAcademico.count({ where }),
        prisma.periodoAcademico.findMany({
          where,
          include: {
            _count: {
              select: {
                secciones: true,
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
        prisma.seccion.count(),
        prisma.profesorDedicacion.count(),
      ]);

      // Métricas de cobertura por cada período en la página
      const periodosConMetricas = await Promise.all(
        periodos.map(async (p) => {
          const seccionesAsignadas = await prisma.seccion.count({
            where: {
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

      await prisma.periodoAcademico.update({
        where: { id },
        data: { estado },
      });

      return res.redirect('/periodos?msg=' + encodeURIComponent('Estado del período actualizado correctamente.'));
    } catch (err: any) {
      console.error('[ESTADO-PERIODO-ERROR]', err);
      return res.redirect('/periodos?error=' + encodeURIComponent('No se pudo actualizar el estado.'));
    }
  }

  /**
   * Panel de gestión de oferta académica y secciones de un período con SchaahDataTable server-side (Spec 07)
   */
  static async secciones(req: Request, res: Response) {
    try {
      const { id: periodoId } = req.params;

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
      const sortBy = typeof req.query.sortBy === 'string' ? req.query.sortBy.trim() : 'codigoSeccion';
      const sortDir = req.query.sortDir === 'desc' ? 'desc' : 'asc';

      const validSortColumns = ['codigoSeccion', 'turno', 'cuposEstimados', 'createdAt'];
      const activeSortBy = validSortColumns.includes(sortBy) ? sortBy : 'codigoSeccion';

      // Construcción dinámica de la cláusula WHERE (Spec 07)
      const where: any = {
        periodoId,
      };

      if (turnoParam) {
        where.turno = turnoParam;
      }
      if (sedeIdParam) {
        where.sedeId = sedeIdParam;
      }
      if (pfgIdParam) {
        where.unidadCurricular = {
          pfgId: pfgIdParam,
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
      ] = await Promise.all([
        prisma.seccion.count({ where }),
        prisma.seccion.findMany({
          where,
          include: {
            unidadCurricular: {
              include: { pfg: true },
            },
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
        prisma.seccion.count({ where: { periodoId } }),
        prisma.seccion.count({ where: { periodoId, profesorId: { not: null } } }),
        prisma.seccion.count({ where: { periodoId, profesorId: null } }),
        prisma.seccion.aggregate({
          where: { periodoId },
          _sum: { cuposEstimados: true },
        }),
        prisma.programaFormacion.findMany({
          where: { activo: true },
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
          },
          orderBy: [{ apellidos: 'asc' }, { nombres: 'asc' }],
        }),
      ]);

      const totalPages = Math.ceil(totalFiltrados / limit) || 1;

      res.render('pages/periodos/secciones', {
        title: `Oferta Académica - ${periodo.codigo}`,
        periodo,
        secciones,
        pfgs,
        sedes,
        profesores,
        turnos: Object.values(Turno),
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
          pfgId: pfgIdParam,
          turno: turnoParam,
          sedeId: sedeIdParam,
          docente: docenteParam,
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
      const {
        unidadCurricularId,
        sedeId,
        profesorId,
        codigoSeccion,
        turno,
        cuposEstimados,
      } = req.body;

      if (!unidadCurricularId || !sedeId || !codigoSeccion) {
        return res.redirect(
          `/periodos/${periodoId}/secciones?error=` +
            encodeURIComponent('Unidad Curricular, Sede y Código de Sección son campos obligatorios.')
        );
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
          sedeId,
          profesorId: profesorId ? profesorId : null,
          codigoSeccion: codigoSeccion.trim().toUpperCase(),
          turno: turno || 'MATUTINO',
          cuposEstimados: parseInt(cuposEstimados, 10) || 30,
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
   * Asignar o remover docente de una sección con validación H-04
   */
  static async asignarDocente(req: Request, res: Response) {
    const { id: periodoId, seccionId } = req.params;
    try {
      const { profesorId } = req.body;

      const profId = profesorId && profesorId.trim() !== '' ? profesorId.trim() : null;

      // Si se está asignando un docente, verificar sus horas actuales vs tope H-04
      if (profId) {
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

          const horasActuales = seccionesAsignadas.reduce(
            (acc, s) => acc + (s.unidadCurricular.horasTeoricasSemanales + s.unidadCurricular.horasPracticasSemanales),
            0
          );

          const seccionDestino = await prisma.seccion.findUnique({
            where: { id: seccionId },
            include: { unidadCurricular: true },
          });

          const horasNuevas = seccionDestino
            ? seccionDestino.unidadCurricular.horasTeoricasSemanales + seccionDestino.unidadCurricular.horasPracticasSemanales
            : 0;

          const totalProyectado = horasActuales + horasNuevas;

          const evaluacion = evaluarNormativaDocente(dedicacion.dedicacion, totalProyectado);
          if (evaluacion.estado === 'SOBRECARGA') {
            return res.redirect(
              `/periodos/${periodoId}/secciones?error=` +
                encodeURIComponent(
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

      return res.redirect(
        `/periodos/${periodoId}/secciones?msg=` +
          encodeURIComponent('Asignación docente actualizada exitosamente.')
      );
    } catch (err: any) {
      console.error('[ASIGNAR-DOCENTE-ERROR]', err);
      return res.redirect(
        `/periodos/${periodoId}/secciones?error=` +
          encodeURIComponent(err.message || 'Error al actualizar asignación.')
      );
    }
  }

  /**
   * Eliminar sección si no tiene horarios asignados
   */
  static async eliminarSeccion(req: Request, res: Response) {
    const { id: periodoId, seccionId } = req.params;
    try {
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
