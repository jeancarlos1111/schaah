import { Request, Response } from 'express';
import prisma from '../../../core/database/prisma';
import {
  DedicacionDocente,
  EscalafonDocente,
  CondicionLaboral,
  DiaSemana,
} from '../../../core/domain/enums';
import {
  LIMITES_DEDICACION,
  evaluarNormativaDocente,
} from '../../../core/domain/rules/dedicacionRules';

// Helper para asegurar o recuperar el período académico activo (por defecto 2026-I)
async function getPeriodoActivo() {
  let periodo = await prisma.periodoAcademico.findFirst({
    where: { estado: { in: ['ACTIVO', 'BORRADOR'] } },
    orderBy: { createdAt: 'desc' },
  });

  if (!periodo) {
    periodo = await prisma.periodoAcademico.upsert({
      where: { codigo: '2026-I' },
      update: {},
      create: {
        codigo: '2026-I',
        nombre: 'Período Académico 2026-I (Semestral)',
        fechaInicio: new Date('2026-02-02'),
        fechaFin: new Date('2026-07-24'),
        estado: 'ACTIVO',
      },
    });
  }

  return periodo;
}

export class DocentesController {
  /**
   * Listado principal de profesores con SchaahDataTable server-side y métricas Bento
   */
  async index(req: Request, res: Response) {
    try {
      const periodoActivo = await getPeriodoActivo();

      const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 10));
      const skip = (page - 1) * limit;

      const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
      const dedicacionParam = typeof req.query.dedicacion === 'string' ? req.query.dedicacion.trim() : '';
      const escalafonParam = typeof req.query.escalafon === 'string' ? req.query.escalafon.trim() : '';
      const condicionParam = typeof req.query.condicion === 'string' ? req.query.condicion.trim() : '';
      const sedeIdParam = typeof req.query.sedeId === 'string' ? req.query.sedeId.trim() : '';
      const estadoParam = typeof req.query.estado === 'string' ? req.query.estado.trim() : '';
      const sortBy = typeof req.query.sortBy === 'string' ? req.query.sortBy.trim() : 'apellidos';
      const sortDir = req.query.sortDir === 'desc' ? 'desc' : 'asc';

      const validSortColumns = ['cedula', 'apellidos', 'nombres', 'escalafon', 'condicion', 'activo', 'createdAt'];
      const activeSortBy = validSortColumns.includes(sortBy) ? sortBy : 'apellidos';

      const where: any = {};

      if (escalafonParam) where.escalafon = escalafonParam;
      if (condicionParam) where.condicion = condicionParam;
      if (estadoParam === 'Activo' || estadoParam === 'true') where.activo = true;
      if (estadoParam === 'Inactivo' || estadoParam === 'false') where.activo = false;

      if (q) {
        where.OR = [
          { cedula: { contains: q } },
          { nombres: { contains: q } },
          { apellidos: { contains: q } },
          { email: { contains: q } },
        ];
      }

      if (dedicacionParam || sedeIdParam) {
        where.dedicaciones = {
          some: {
            periodoId: periodoActivo.id,
            ...(dedicacionParam ? { dedicacion: dedicacionParam } : {}),
            ...(sedeIdParam ? { sedeAdscripcionPrincipalId: sedeIdParam } : {}),
          },
        };
      }

      const [totalFiltrados, profesores, sedes, totalDocentesGen, totalExclusivos, totalTiempoCompleto, totalMedioTiempoConvencional] = await Promise.all([
        prisma.profesor.count({ where }),
        prisma.profesor.findMany({
          where,
          include: {
            dedicaciones: {
              where: { periodoId: periodoActivo.id },
              include: { sedePrincipal: true },
            },
            secciones: {
              where: { periodoId: periodoActivo.id },
              include: {
                unidadCurricular: true,
                horarios: true,
              },
            },
          },
          orderBy: { [activeSortBy]: sortDir },
          skip,
          take: limit,
        }),
        prisma.sede.findMany({
          where: { activa: true },
          orderBy: { nombre: 'asc' },
        }),
        prisma.profesor.count({ where: { activo: true } }),
        prisma.profesorDedicacion.count({
          where: { periodoId: periodoActivo.id, dedicacion: DedicacionDocente.DEDICACION_EXCLUSIVA },
        }),
        prisma.profesorDedicacion.count({
          where: { periodoId: periodoActivo.id, dedicacion: DedicacionDocente.TIEMPO_COMPLETO },
        }),
        prisma.profesorDedicacion.count({
          where: {
            periodoId: periodoActivo.id,
            dedicacion: { in: [DedicacionDocente.MEDIO_TIEMPO, DedicacionDocente.TIEMPO_CONVENCIONAL] },
          },
        }),
      ]);

      // Mapeo con evaluación de normativa H-04 y H-05
      const profesoresData = profesores.map((p) => {
        const dedicacionActiva = p.dedicaciones[0] || null;
        let horasDocencia = 0;
        for (const sec of p.secciones) {
          horasDocencia += (sec.unidadCurricular.horasTeoricasSemanales + sec.unidadCurricular.horasPracticasSemanales);
        }

        const evaluacion = dedicacionActiva
          ? evaluarNormativaDocente(dedicacionActiva.dedicacion, horasDocencia)
          : null;

        return {
          ...p,
          dedicacionActiva,
          horasDocencia,
          evaluacion,
        };
      });

      const totalPages = Math.ceil(totalFiltrados / limit) || 1;
      const success = typeof req.query.msg === 'string' ? req.query.msg : null;
      const errorMsg = typeof req.query.error === 'string' ? req.query.error : null;

      return res.render('pages/docentes/index', {
        title: 'Gestión de Docentes y Régimen de Dedicación',
        periodoActivo,
        profesores: profesoresData,
        sedes,
        success,
        error: errorMsg,
        enums: {
          DedicacionDocente,
          EscalafonDocente,
          CondicionLaboral,
        },
        metricas: {
          totalDocentesGen,
          totalExclusivos,
          totalTiempoCompleto,
          totalMedioTiempoConvencional,
        },
        pagination: {
          page,
          limit,
          total: totalFiltrados,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
        filters: {
          q,
          dedicacion: dedicacionParam,
          escalafon: escalafonParam,
          condicion: condicionParam,
          sedeId: sedeIdParam,
          estado: estadoParam,
          sortBy: activeSortBy,
          sortDir,
        },
      });
    } catch (error) {
      console.error('[DOCENTES-INDEX-ERROR]', error);
      return res.status(500).render('pages/error', {
        title: 'Error de Servidor',
        error: 'No se pudo cargar la nómina de docentes.',
      });
    }
  }

  /**
   * Registro de nuevo docente y asignación de dedicación
   */
  async crear(req: Request, res: Response) {
    try {
      const {
        cedula,
        nombres,
        apellidos,
        email,
        telefono,
        condicion,
        escalafon,
        dedicacion,
        sedeAdscripcionPrincipalId,
        observacionExcepcion,
      } = req.body;

      if (!cedula || !nombres || !apellidos || !email || !sedeAdscripcionPrincipalId) {
        return res.redirect('/docentes?error=Campos+obligatorios+incompletos');
      }

      const periodoActivo = await getPeriodoActivo();
      const limites = LIMITES_DEDICACION[dedicacion] || LIMITES_DEDICACION[DedicacionDocente.TIEMPO_COMPLETO];

      await prisma.$transaction(async (tx) => {
        const profesor = await tx.profesor.create({
          data: {
            cedula: cedula.trim().toUpperCase(),
            nombres: nombres.trim(),
            apellidos: apellidos.trim(),
            email: email.trim().toLowerCase(),
            telefono: telefono ? telefono.trim() : null,
            condicion: condicion || CondicionLaboral.ORDINARIO,
            escalafon: escalafon || EscalafonDocente.INSTRUCTOR,
            activo: true,
          },
        });

        if (dedicacion) {
          await tx.profesorDedicacion.create({
            data: {
              profesorId: profesor.id,
              periodoId: periodoActivo.id,
              dedicacion: dedicacion,
              horasPermanenciaSemanales: limites.maxPermanencia,
              minHorasDocenciaDirecta: limites.minDocencia,
              maxHorasDocenciaDirecta: limites.maxDocencia,
              sedeAdscripcionPrincipalId: sedeAdscripcionPrincipalId,
              observacionExcepcion: observacionExcepcion ? observacionExcepcion.trim() : null,
            },
          });
        }
      });

      return res.redirect('/docentes?msg=Docente+registrado+con+exito');
    } catch (error: any) {
      console.error('[DOCENTES-CREAR-ERROR]', error);
      const isUniqueError = error?.code === 'P2002';
      const msg = isUniqueError ? 'Cedula+o+correo+ya+registrado' : 'Error+al+registrar+docente';
      return res.redirect(`/docentes?error=${msg}`);
    }
  }

  /**
   * Edición de información docente y actualización de dedicación
   */
  async editar(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const {
        nombres,
        apellidos,
        email,
        telefono,
        condicion,
        escalafon,
        dedicacion,
        sedeAdscripcionPrincipalId,
        observacionExcepcion,
      } = req.body;

      const periodoActivo = await getPeriodoActivo();
      const limites = LIMITES_DEDICACION[dedicacion] || LIMITES_DEDICACION[DedicacionDocente.TIEMPO_COMPLETO];

      await prisma.$transaction(async (tx) => {
        await tx.profesor.update({
          where: { id },
          data: {
            nombres: nombres.trim(),
            apellidos: apellidos.trim(),
            email: email.trim().toLowerCase(),
            telefono: telefono ? telefono.trim() : null,
            condicion: condicion || CondicionLaboral.ORDINARIO,
            escalafon: escalafon || EscalafonDocente.INSTRUCTOR,
          },
        });

        if (dedicacion && sedeAdscripcionPrincipalId) {
          await tx.profesorDedicacion.upsert({
            where: {
              profesorId_periodoId: {
                profesorId: id,
                periodoId: periodoActivo.id,
              },
            },
            update: {
              dedicacion,
              horasPermanenciaSemanales: limites.maxPermanencia,
              minHorasDocenciaDirecta: limites.minDocencia,
              maxHorasDocenciaDirecta: limites.maxDocencia,
              sedeAdscripcionPrincipalId,
              observacionExcepcion: observacionExcepcion ? observacionExcepcion.trim() : null,
            },
            create: {
              profesorId: id,
              periodoId: periodoActivo.id,
              dedicacion,
              horasPermanenciaSemanales: limites.maxPermanencia,
              minHorasDocenciaDirecta: limites.minDocencia,
              maxHorasDocenciaDirecta: limites.maxDocencia,
              sedeAdscripcionPrincipalId,
              observacionExcepcion: observacionExcepcion ? observacionExcepcion.trim() : null,
            },
          });
        }
      });

      return res.redirect('/docentes?msg=Docente+actualizado+con+exito');
    } catch (error) {
      console.error('[DOCENTES-EDITAR-ERROR]', error);
      return res.redirect('/docentes?error=Error+al+modificar+docente');
    }
  }

  /**
   * Conmutador de estado activo/inactivo
   */
  async toggle(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const profesor = await prisma.profesor.findUnique({ where: { id } });
      if (!profesor) return res.redirect('/docentes?error=Docente+no+encontrado');

      await prisma.profesor.update({
        where: { id },
        data: { activo: !profesor.activo },
      });

      return res.redirect('/docentes?msg=Estado+del+docente+actualizado');
    } catch (error) {
      console.error('[DOCENTES-TOGGLE-ERROR]', error);
      return res.redirect('/docentes?error=Error+al+cambiar+estado');
    }
  }

  /**
   * Redirección inteligente a la propia disponibilidad del usuario docente autenticado (Spec 06)
   */
  async miDisponibilidad(req: Request, res: Response) {
    try {
      const usuario = (req.session as any)?.usuario;
      if (!usuario) return res.redirect('/login');

      let profesor = null;
      if (usuario.profesorId) {
        profesor = await prisma.profesor.findUnique({ where: { id: usuario.profesorId } });
      }
      if (!profesor) {
        profesor = await prisma.profesor.findFirst({ where: { email: usuario.email } });
        if (profesor) {
          await prisma.usuario.update({
            where: { id: usuario.id },
            data: { profesorId: profesor.id },
          });
          usuario.profesorId = profesor.id;
        }
      }

      if (!profesor) {
        return res.status(404).render('pages/error', {
          title: 'Perfil Docente No Encontrado',
          error: 'Su cuenta de usuario no está asociada a ningún perfil docente en el sistema.',
        });
      }

      return res.redirect(`/docentes/${profesor.id}/disponibilidad`);
    } catch (err) {
      console.error('[MI-DISPONIBILIDAD-ERROR]', err);
      return res.redirect('/?error=Error+accediendo+a+disponibilidad');
    }
  }

  /**
   * Matriz semanal interactiva de disponibilidad y preferencias (Regla H-06 y S-02)
   */
  async disponibilidad(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const usuario = (req.session as any)?.usuario;

      // Autoprotección RBAC: Si el usuario es DOCENTE, solo puede ver y editar su propia disponibilidad
      if (usuario && usuario.rol === 'DOCENTE') {
        const docenteAutenticado = await prisma.profesor.findFirst({
          where: {
            OR: [
              { id: usuario.profesorId || '' },
              { email: usuario.email },
            ],
          },
        });
        if (!docenteAutenticado || docenteAutenticado.id !== id) {
          return res.status(403).render('pages/error', {
            title: 'Acceso Denegado (RBAC)',
            error: 'No tiene autorización para consultar ni modificar la disponibilidad de otros docentes.',
          });
        }
      }

      const periodoActivo = await getPeriodoActivo();

      const profesor = await prisma.profesor.findUnique({
        where: { id },
        include: {
          dedicaciones: {
            where: { periodoId: periodoActivo.id },
            include: { sedePrincipal: true },
          },
          disponibilidades: {
            where: { periodoId: periodoActivo.id },
          },
        },
      });

      if (!profesor) {
        return res.status(404).render('pages/error', {
          title: 'Docente no encontrado',
          error: 'El docente solicitado no existe en el sistema.',
        });
      }

      // Franjas horarias canónicas de la UBV
      const franjas = [
        { codigo: '07:30-09:00', horaInicio: '07:30', horaFin: '09:00', turno: 'MATUTINO', label: 'Bloque 1 (07:30 - 09:00)' },
        { codigo: '09:05-10:35', horaInicio: '09:05', horaFin: '10:35', turno: 'MATUTINO', label: 'Bloque 2 (09:05 - 10:35)' },
        { codigo: '10:45-12:15', horaInicio: '10:45', horaFin: '12:15', turno: 'MATUTINO', label: 'Bloque 3 (10:45 - 12:15)' },
        { codigo: '12:30-14:00', horaInicio: '12:30', horaFin: '14:00', turno: 'VESPERTINO', label: 'Bloque 4 (12:30 - 14:00)' },
        { codigo: '14:05-15:35', horaInicio: '14:05', horaFin: '15:35', turno: 'VESPERTINO', label: 'Bloque 5 (14:05 - 15:35)' },
        { codigo: '15:45-17:15', horaInicio: '15:45', horaFin: '17:15', turno: 'VESPERTINO', label: 'Bloque 6 (15:45 - 17:15)' },
        { codigo: '17:30-19:00', horaInicio: '17:30', horaFin: '19:00', turno: 'NOCTURNO', label: 'Bloque 7 (17:30 - 19:00)' },
        { codigo: '19:05-20:35', horaInicio: '19:05', horaFin: '20:35', turno: 'NOCTURNO', label: 'Bloque 8 (19:05 - 20:35)' },
      ];

      const dias = [
        DiaSemana.LUNES,
        DiaSemana.MARTES,
        DiaSemana.MIERCOLES,
        DiaSemana.JUEVES,
        DiaSemana.VIERNES,
        DiaSemana.SABADO,
      ];

      // Mapear matriz en formato indexado [dia][horaInicio] = { disponible, prioridad }
      const disponibilidadMap: Record<string, Record<string, { disponible: boolean; prioridad: number }>> = {};
      dias.forEach((d) => {
        disponibilidadMap[d] = {};
      });

      for (const disp of profesor.disponibilidades) {
        if (!disponibilidadMap[disp.dia]) {
          disponibilidadMap[disp.dia] = {};
        }
        disponibilidadMap[disp.dia][disp.horaInicio] = {
          disponible: disp.disponible,
          prioridad: disp.prioridadPreferencia,
        };
      }

      const success = typeof req.query.msg === 'string' ? req.query.msg : null;
      const errorMsg = typeof req.query.error === 'string' ? req.query.error : null;

      return res.render('pages/docentes/disponibilidad', {
        title: `Disponibilidad Horaria - ${profesor.nombres} ${profesor.apellidos}`,
        profesor,
        periodoActivo,
        dedicacion: profesor.dedicaciones[0] || null,
        dias,
        franjas,
        disponibilidadMap,
        success,
        error: errorMsg,
      });
    } catch (error) {
      console.error('[DOCENTES-DISPONIBILIDAD-ERROR]', error);
      return res.status(500).render('pages/error', {
        title: 'Error de Disponibilidad',
        error: 'No se pudo cargar la matriz horaria del docente.',
      });
    }
  }

  /**
   * Guarda las franjas y preferencias seleccionadas
   */
  async guardarDisponibilidad(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const usuario = (req.session as any)?.usuario;

      // Autoprotección RBAC: Si el usuario es DOCENTE, solo puede modificar su propio registro
      if (usuario && usuario.rol === 'DOCENTE') {
        const docenteAutenticado = await prisma.profesor.findFirst({
          where: {
            OR: [
              { id: usuario.profesorId || '' },
              { email: usuario.email },
            ],
          },
        });
        if (!docenteAutenticado || docenteAutenticado.id !== id) {
          return res.status(403).redirect(`/docentes?error=Acceso+denegado+por+politica+RBAC`);
        }
      }

      const periodoActivo = await getPeriodoActivo();
      const slotsPayload = req.body.slots ? JSON.parse(req.body.slots) : [];

      await prisma.$transaction(async (tx) => {
        // Eliminar disponibilidad previa para este período
        await tx.profesorDisponibilidad.deleteMany({
          where: {
            profesorId: id,
            periodoId: periodoActivo.id,
          },
        });

        // Insertar nuevas franjas
        if (Array.isArray(slotsPayload) && slotsPayload.length > 0) {
          const toInsert = slotsPayload.map((s: any) => ({
            profesorId: id,
            periodoId: periodoActivo.id,
            dia: s.dia,
            horaInicio: s.horaInicio,
            horaFin: s.horaFin,
            prioridadPreferencia: parseInt(s.prioridad, 10) || 1,
            disponible: s.disponible === true || s.disponible === 'true',
          }));

          await tx.profesorDisponibilidad.createMany({
            data: toInsert,
          });
        }
      });

      return res.redirect(`/docentes/${id}/disponibilidad?msg=Disponibilidad+actualizada+correctamente`);
    } catch (error) {
      console.error('[DOCENTES-GUARDAR-DISPONIBILIDAD-ERROR]', error);
      return res.redirect(`/docentes/${req.params.id}/disponibilidad?error=Error+guardando+disponibilidad`);
    }
  }

  /**
   * Planilla oficial de Carga Horaria Consolidada UBV (Docencia directa + permanencia + estado normativo)
   */
  async cargaConsolidada(req: Request, res: Response) {
    try {
      const periodoActivo = await getPeriodoActivo();

      const dedicacionFiltro = typeof req.query.dedicacion === 'string' ? req.query.dedicacion.trim() : '';
      const estadoFiltro = typeof req.query.estado === 'string' ? req.query.estado.trim() : '';
      const sedeFiltro = typeof req.query.sedeId === 'string' ? req.query.sedeId.trim() : '';

      const whereProfesor: any = { activo: true };

      if (dedicacionFiltro || sedeFiltro) {
        whereProfesor.dedicaciones = {
          some: {
            periodoId: periodoActivo.id,
            ...(dedicacionFiltro ? { dedicacion: dedicacionFiltro } : {}),
            ...(sedeFiltro ? { sedeAdscripcionPrincipalId: sedeFiltro } : {}),
          },
        };
      }

      const [profesores, sedes] = await Promise.all([
        prisma.profesor.findMany({
          where: whereProfesor,
          include: {
            dedicaciones: {
              where: { periodoId: periodoActivo.id },
              include: { sedePrincipal: true },
            },
            secciones: {
              where: { periodoId: periodoActivo.id },
              include: {
                unidadCurricular: {
                  include: { pfg: true },
                },
                sede: true,
                horarios: {
                  include: { espacioFisico: true },
                },
              },
            },
          },
          orderBy: { apellidos: 'asc' },
        }),
        prisma.sede.findMany({ where: { activa: true }, orderBy: { nombre: 'asc' } }),
      ]);

      // Métricas y consolidación
      let totalEnNorma = 0;
      let totalDeficit = 0;
      let totalSobrecarga = 0;
      let totalSinAsignar = 0;
      let totalHorasDirectasGlobal = 0;

      const consolidado = profesores.map((p) => {
        const dedicacion = p.dedicaciones[0] || null;
        let horasDocencia = 0;
        let horasProyectoComunidad = 0;

        for (const sec of p.secciones) {
          const teo = sec.unidadCurricular.horasTeoricasSemanales || 0;
          const pra = sec.unidadCurricular.horasPracticasSemanales || 0;
          const campo = sec.unidadCurricular.horasCampoComunitarioSemanales || 0;

          horasDocencia += (teo + pra);
          horasProyectoComunidad += campo;
        }

        totalHorasDirectasGlobal += horasDocencia;

        const evaluacion = dedicacion
          ? evaluarNormativaDocente(dedicacion.dedicacion, horasDocencia)
          : {
              estado: 'SIN_ASIGNAR' as const,
              horasDocenciaDirecta: 0,
              minHoras: 0,
              maxHoras: 0,
              diferencia: 0,
              mensaje: 'Sin dedicación registrada en período',
              badgeClass: 'badge-muted',
            };

        if (evaluacion.estado === 'EN_NORMA') totalEnNorma++;
        else if (evaluacion.estado === 'DEFICIT') totalDeficit++;
        else if (evaluacion.estado === 'SOBRECARGA') totalSobrecarga++;
        else totalSinAsignar++;

        const limites = dedicacion ? LIMITES_DEDICACION[dedicacion.dedicacion] : null;

        // Desglose institucional estimado según formula UBV:
        // Horas Permanencia = Docencia Directa + Horas Proyecto/Comunidad + Asesorías + Investigación/Gestión
        const horasPermanencia = dedicacion ? dedicacion.horasPermanenciaSemanales : 0;
        const horasAsesoriaEstimadas = limites ? limites.minProyectoComunidad : 4;
        const horasInvestigacionEstimadas = Math.max(0, horasPermanencia - (horasDocencia + horasProyectoComunidad + horasAsesoriaEstimadas));

        return {
          profesor: p,
          dedicacion,
          horasDocencia,
          horasProyectoComunidad,
          horasAsesoriaEstimadas,
          horasInvestigacionEstimadas,
          horasPermanencia,
          evaluacion,
          secciones: p.secciones,
        };
      });

      // Filtrado por estado normativo si se solicitó
      const consolidadoFiltrado = estadoFiltro
        ? consolidado.filter((c) => c.evaluacion.estado === estadoFiltro)
        : consolidado;

      return res.render('pages/docentes/carga-consolidada', {
        title: 'Planilla Oficial de Carga Horaria Docente (UBV)',
        periodoActivo,
        sedes,
        consolidado: consolidadoFiltrado,
        enums: { DedicacionDocente },
        metricas: {
          totalDocentes: consolidado.length,
          totalEnNorma,
          totalDeficit,
          totalSobrecarga,
          totalSinAsignar,
          totalHorasDirectasGlobal,
        },
        filtros: {
          dedicacion: dedicacionFiltro,
          estado: estadoFiltro,
          sedeId: sedeFiltro,
        },
      });
    } catch (error) {
      console.error('[DOCENTES-CARGA-CONSOLIDADA-ERROR]', error);
      return res.status(500).render('pages/error', {
        title: 'Error de Consolidación',
        error: 'No se pudo generar la planilla de carga docente.',
      });
    }
  }
}
