import { Request, Response } from 'express';
import prisma from '../../../core/database/prisma';
import {
  DedicacionDocente,
  EscalafonDocente,
  CondicionLaboral,
  DiaSemana,
  RolUsuario,
} from '../../../core/domain/enums';
import {
  LIMITES_DEDICACION,
  evaluarNormativaDocente,
  horasDocenciaSeccion,
} from '../../../core/domain/rules/dedicacionRules';
import { normalizarCedula, serialExcelAAnio } from '../../../core/domain/rules/ofertaNormalizacion';
import { BLOQUES_HORARIOS_OFICIALES, formatearFechaHora12 } from '../../../core/domain/rules/timeSlotUtils';
import { filtroPfg } from '../../../core/domain/rules/alcancePfgRules';
import {
  FranjaDisponibilidad,
  LONGITUD_MINIMA_MOTIVO,
  compararDisponibilidad,
  normalizarFranjas,
  permisoDisponibilidad,
  validarMotivo,
} from '../../../core/domain/rules/disponibilidadPermisos';
import {
  elegirPeriodoDisponibilidad,
  periodosParaDisponibilidad,
} from '../../../core/domain/rules/periodoDisponibilidadRules';
import { alcanceDe } from '../../auth/middlewares/alcancePfg';
import { profesorPropioId } from '../profesorPropio';

function textoOpcional(valor: unknown): string | null {
  const t = typeof valor === 'string' ? valor.trim() : '';
  return t || null;
}

/** Campos del docente que provienen del consolidado de oferta (profesión, 4to nivel, años, centro). */
function datosComplementariosDocente(body: Record<string, unknown>) {
  return {
    profesion: textoOpcional(body.profesion),
    estudiosCuartoNivel: textoOpcional(body.estudiosCuartoNivel),
    anioIngreso: serialExcelAAnio(textoOpcional(body.anioIngreso)),
    anioConcurso: serialExcelAAnio(textoOpcional(body.anioConcurso)),
    centroEstudioId: textoOpcional(body.centroEstudioId),
  };
}

// Helper para recuperar el período académico vigente (ACTIVO primero; luego el BORRADOR más reciente)
async function getPeriodoActivo() {
  let periodo =
    (await prisma.periodoAcademico.findFirst({ where: { estado: 'ACTIVO' }, orderBy: { createdAt: 'desc' } })) ??
    (await prisma.periodoAcademico.findFirst({ where: { estado: 'BORRADOR' }, orderBy: { createdAt: 'desc' } }));

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

async function periodosDisponibilidad() {
  return periodosParaDisponibilidad(
    await prisma.periodoAcademico.findMany({ where: { estado: { not: 'CERRADO' } } })
  );
}

function parametroTexto(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() ? valor.trim() : null;
}

async function permisoSobreDisponibilidad(req: Request, profesorId: string, periodoId: string) {
  const usuario = (req.session as any)?.usuario;
  const pfgIdsDelDocente =
    usuario?.rol === RolUsuario.COORDINADOR_PFG
      ? (
          await prisma.seccion.findMany({
            where: { profesorId, periodoId },
            select: { unidadCurricular: { select: { pfgId: true } } },
          })
        ).map((s) => s.unidadCurricular.pfgId)
      : [];
  return permisoDisponibilidad(
    { rol: usuario?.rol, profesorIdPropio: await profesorPropioId(usuario) },
    profesorId,
    pfgIdsDelDocente,
    alcanceDe(req)
  );
}

/**
 * Docentes cuya disponibilidad puede abrir el coordinador en el período que se planifica
 * (`null` = todos, para Administración y Dirección).
 */
async function docentesConDisponibilidadEditable(req: Request): Promise<string[] | null> {
  const alcance = alcanceDe(req);
  if (alcance.total) return null;
  const periodo = elegirPeriodoDisponibilidad(await periodosDisponibilidad());
  if (!periodo) return [];
  const secciones = await prisma.seccion.findMany({
    where: { periodoId: periodo.id, profesorId: { not: null }, unidadCurricular: { pfgId: filtroPfg(alcance) } },
    select: { profesorId: true },
    distinct: ['profesorId'],
  });
  return secciones.map((s) => s.profesorId!);
}

const ETIQUETAS_ROL: Record<string, string> = {
  [RolUsuario.ADMINISTRADOR]: 'Administrador',
  [RolUsuario.DIRECTOR_ACADEMICO]: 'Director Académico',
  [RolUsuario.COORDINADOR_PFG]: 'Coordinador de PFG',
  [RolUsuario.DOCENTE]: 'Docente',
};

function franjasGuardadas(json: string | null): FranjaDisponibilidad[] {
  if (!json) return [];
  try {
    const datos = JSON.parse(json);
    return Array.isArray(datos) ? datos : [];
  } catch {
    return [];
  }
}

/** Últimos cambios de la disponibilidad del docente en el período, listos para la vista. */
async function historialDisponibilidad(profesorId: string, periodoId: string) {
  const registros = await prisma.auditoriaDisponibilidad.findMany({
    where: { profesorId, periodoId },
    orderBy: { fecha: 'desc' },
    take: 20,
  });
  const usuarios = await prisma.usuario.findMany({
    where: { email: { in: [...new Set(registros.map((r) => r.usuarioResponsable))] } },
    select: { email: true, nombres: true, apellidos: true },
  });
  const nombres = new Map(usuarios.map((u) => [u.email, `${u.nombres} ${u.apellidos}`]));
  return registros.map((r) => {
    const detalle = compararDisponibilidad(franjasGuardadas(r.datosAnteriores), franjasGuardadas(r.datosNuevos));
    return {
      id: r.id,
      fecha: formatearFechaHora12(r.fecha),
      responsable: nombres.get(r.usuarioResponsable) ?? r.usuarioResponsable,
      correo: r.usuarioResponsable,
      rol: ETIQUETAS_ROL[r.rolResponsable] ?? r.rolResponsable,
      resumen: r.resumen,
      motivo: r.motivo,
      agregadas: detalle.agregadas,
      quitadas: detalle.quitadas,
      cambiosPrioridad: detalle.cambiosPrioridad.map((c) => `${c.franja} (P${c.antes} a P${c.despues})`),
    };
  });
}

function franjasDelFormulario(valor: unknown): FranjaDisponibilidad[] {
  const datos = typeof valor === 'string' && valor ? JSON.parse(valor) : [];
  if (!Array.isArray(datos)) return [];
  return datos
    .filter((s: any) => typeof s?.dia === 'string' && typeof s?.horaInicio === 'string' && typeof s?.horaFin === 'string')
    .map((s: any) => ({
      dia: s.dia,
      horaInicio: s.horaInicio,
      horaFin: s.horaFin,
      prioridad: Math.min(3, Math.max(1, parseInt(s.prioridad, 10) || 1)),
      disponible: s.disponible !== false && s.disponible !== 'false',
    }));
}

export class DocentesController {
  /**
   * Listado principal de profesores con SahadDataTable server-side y métricas Bento
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
            centroEstudio: true,
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
          horasDocencia += horasDocenciaSeccion(sec);
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
      const centrosEstudio = await prisma.centroEstudio.findMany({ where: { activo: true }, orderBy: { codigo: 'asc' } });

      return res.render('pages/docentes/index', {
        title: 'Gestión de Docentes y Régimen de Dedicación',
        periodoActivo,
        disponibilidadEditable: await docentesConDisponibilidadEditable(req),
        profesores: profesoresData,
        sedes,
        centrosEstudio,
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

      if (!cedula || !nombres || !apellidos || !sedeAdscripcionPrincipalId) {
        return res.redirect('/docentes?error=Campos+obligatorios+incompletos');
      }

      const periodoActivo = await getPeriodoActivo();
      const limites = LIMITES_DEDICACION[dedicacion] || LIMITES_DEDICACION[DedicacionDocente.TIEMPO_COMPLETO];

      await prisma.$transaction(async (tx) => {
        const profesor = await tx.profesor.create({
          data: {
            cedula: normalizarCedula(cedula) ?? cedula.trim().toUpperCase(),
            nombres: nombres.trim(),
            apellidos: apellidos.trim(),
            email: textoOpcional(email)?.toLowerCase() ?? null,
            telefono: telefono ? telefono.trim() : null,
            condicion: condicion || CondicionLaboral.ORDINARIO,
            escalafon: escalafon || EscalafonDocente.INSTRUCTOR,
            ...datosComplementariosDocente(req.body),
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
            email: textoOpcional(email)?.toLowerCase() ?? null,
            telefono: telefono ? telefono.trim() : null,
            condicion: condicion || CondicionLaboral.ORDINARIO,
            escalafon: escalafon || EscalafonDocente.INSTRUCTOR,
            ...datosComplementariosDocente(req.body),
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
    } catch (error: any) {
      console.error('[DOCENTES-EDITAR-ERROR]', error);
      const msg = error?.code === 'P2002' ? 'Correo+ya+registrado+por+otro+docente' : 'Error+al+modificar+docente';
      return res.redirect(`/docentes?error=${msg}`);
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

      const periodos = await periodosDisponibilidad();
      const solicitado = parametroTexto(req.query.periodoId);
      const periodoActivo = elegirPeriodoDisponibilidad(periodos, solicitado) ?? elegirPeriodoDisponibilidad(periodos);
      if (!periodoActivo) {
        return res.status(404).render('pages/error', {
          title: 'Sin períodos abiertos',
          error: 'No hay períodos académicos abiertos para registrar disponibilidad.',
        });
      }

      const permiso = await permisoSobreDisponibilidad(req, id, periodoActivo.id);
      if (!permiso.permitido) {
        return res.status(403).render('pages/error', {
          title: 'Acceso Denegado (RBAC)',
          error:
            usuario?.rol === RolUsuario.COORDINADOR_PFG
              ? 'Solo puede consultar y modificar la disponibilidad de los docentes con asignaciones de sus programas en el período.'
              : 'No tiene autorización para consultar ni modificar la disponibilidad de otros docentes.',
        });
      }
      const avisoPeriodo =
        solicitado && solicitado !== periodoActivo.id
          ? 'El período solicitado no existe o está cerrado; se muestra el período en planificación.'
          : null;

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

      // Franjas horarias canónicas de la UBV con formato oficial venezolano 12h AM/PM
      const franjas = BLOQUES_HORARIOS_OFICIALES;

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
        periodos,
        esDocente: usuario?.rol === RolUsuario.DOCENTE,
        requiereMotivo: permiso.requiereMotivo,
        longitudMinimaMotivo: LONGITUD_MINIMA_MOTIVO,
        historial: await historialDisponibilidad(id, periodoActivo.id),
        dedicacion: profesor.dedicaciones[0] || null,
        dias,
        franjas,
        disponibilidadMap,
        success,
        error: errorMsg ?? avisoPeriodo,
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

      const periodoActivo = elegirPeriodoDisponibilidad(await periodosDisponibilidad(), parametroTexto(req.body.periodoId));
      if (!periodoActivo) {
        return res.redirect(
          `/docentes/${id}/disponibilidad?error=` +
            encodeURIComponent('El período indicado no existe o está cerrado: no se guardaron cambios.')
        );
      }

      const permiso = await permisoSobreDisponibilidad(req, id, periodoActivo.id);
      if (!permiso.permitido) {
        return res.status(403).render('pages/error', {
          title: 'Acceso Denegado (RBAC)',
          error: 'No tiene autorización para modificar la disponibilidad de este docente.',
        });
      }

      const volver = `/docentes/${id}/disponibilidad?periodoId=${periodoActivo.id}`;
      const motivo = validarMotivo(permiso.requiereMotivo, req.body.motivo);
      if (!motivo.valido) {
        return res.redirect(`${volver}&error=` + encodeURIComponent(motivo.error));
      }
      const nuevas = normalizarFranjas(franjasDelFormulario(req.body.slots));

      const comparacion = await prisma.$transaction(async (tx) => {
        const anteriores = (
          await tx.profesorDisponibilidad.findMany({ where: { profesorId: id, periodoId: periodoActivo.id } })
        ).map((d) => ({
          dia: d.dia,
          horaInicio: d.horaInicio,
          horaFin: d.horaFin,
          prioridad: d.prioridadPreferencia,
          disponible: d.disponible,
        }));
        const resultado = compararDisponibilidad(anteriores, nuevas);
        if (!resultado.hayCambios) return resultado;

        await tx.profesorDisponibilidad.deleteMany({ where: { profesorId: id, periodoId: periodoActivo.id } });
        if (nuevas.length > 0) {
          await tx.profesorDisponibilidad.createMany({
            data: nuevas.map((f) => ({
              profesorId: id,
              periodoId: periodoActivo.id,
              dia: f.dia,
              horaInicio: f.horaInicio,
              horaFin: f.horaFin,
              prioridadPreferencia: f.prioridad,
              disponible: true,
            })),
          });
        }
        await tx.auditoriaDisponibilidad.create({
          data: {
            profesorId: id,
            periodoId: periodoActivo.id,
            usuarioResponsable: usuario?.email ?? 'SISTEMA',
            rolResponsable: usuario?.rol ?? 'SISTEMA',
            resumen: resultado.resumen,
            datosAnteriores: JSON.stringify(normalizarFranjas(anteriores)),
            datosNuevos: JSON.stringify(nuevas),
            motivo: motivo.motivo,
          },
        });
        return resultado;
      });

      const mensaje = comparacion.hayCambios
        ? `Disponibilidad del período ${periodoActivo.codigo} actualizada correctamente: ${comparacion.resumen}.`
        : `Sin cambios en la disponibilidad del período ${periodoActivo.codigo}: no se registró nada.`;
      return res.redirect(`${volver}&msg=` + encodeURIComponent(mensaje));
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

      // Spec 06: el coordinador ve a los docentes con asignaciones en sus programas (con su carga total)
      const pfgAlcance = filtroPfg(alcanceDe(req));
      if (pfgAlcance) {
        whereProfesor.secciones = { some: { periodoId: periodoActivo.id, unidadCurricular: { pfgId: pfgAlcance } } };
      }

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
          horasDocencia += horasDocenciaSeccion(sec);
          if (!sec.horasSemanalesOferta) {
            horasProyectoComunidad += sec.unidadCurricular.horasCampoComunitarioSemanales || 0;
          }
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
