import { Request, Response } from 'express';
import prisma from '../../../core/database/prisma';
import { DiaSemana, RolUsuario, TipoBloqueAcademico } from '../../../core/domain/enums';
import { pendientesDeVista } from '../pendientesVista';
import { buscarPeriodoVigente } from '../../periodos/periodoVigente';
import {
  BLOQUES_HORARIOS_OFICIALES,
  to12HourFormat,
} from '../../../core/domain/rules/timeSlotUtils';
import {
  BloqueHorarioExistente,
  PropuestaBloqueHorario,
} from '../../../core/domain/rules/horarioConflictRules';
import {
  DisponibilidadDocenteItem,
  validarAsignacionHoraria,
} from '../../../core/domain/rules/validadorHorarioService';
import {
  filtroPfg,
  filtroPfgEfectivo,
  puedeGestionarPfg,
  puedeProgramarHorarios,
} from '../../../core/domain/rules/alcancePfgRules';
import { alcanceDe, denegarPfg } from '../../auth/middlewares/alcancePfg';
import { profesorPropioId } from '../../docentes/profesorPropio';

export const MENSAJE_SOLO_SU_HORARIO = 'Solo puede consultar su propio horario.';

function cargarSeccionHorario(periodoId: string, seccionId: string) {
  return prisma.seccion.findFirst({
    where: { id: seccionId, periodoId },
    include: {
      unidadCurricular: { include: { prelacionesRequeridas: true } },
      profesor: true,
      sede: true,
    },
  });
}

type SeccionHorario = NonNullable<Awaited<ReturnType<typeof cargarSeccionHorario>>>;

interface DatosPropuestaHoraria {
  horarioId?: string;
  dia: string;
  horaInicio: string;
  horaFin: string;
  espacioFisicoId?: string | null;
}

/**
 * Evalúa las restricciones duras (H-01, H-02, H-03, H-06, H-07, H-08, H-09) de colocar un
 * bloque de la sección contra todos los horarios del período (de cualquier programa).
 */
async function evaluarPropuestaHoraria(periodoId: string, seccion: SeccionHorario, datos: DatosPropuestaHoraria) {
  const { horarioId, dia, horaInicio, horaFin, espacioFisicoId } = datos;

  const espacioPropuesto =
    espacioFisicoId && espacioFisicoId.trim() !== ''
      ? await prisma.espacioFisico.findUnique({ where: { id: espacioFisicoId }, include: { sede: true } })
      : null;

  const sedeEfectivaId = espacioPropuesto ? espacioPropuesto.sedeId : seccion.sedeId;
  const sedeEfectivaNombre = espacioPropuesto ? espacioPropuesto.sede.nombre : seccion.sede.nombre;

  const horariosDB = await prisma.horarioSeccion.findMany({
    where: { seccion: { periodoId } },
    include: {
      seccion: {
        include: {
          profesor: true,
          unidadCurricular: true,
          sede: true,
          grupo: { select: { codigoNormalizado: true } },
        },
      },
      espacioFisico: {
        include: { sede: true },
      },
    },
  });

  const bloquesExistentes: BloqueHorarioExistente[] = horariosDB.map((h) => ({
    id: h.id,
    seccionId: h.seccionId,
    grupoId: h.seccion.grupoId,
    grupoCodigo: h.seccion.grupo?.codigoNormalizado ?? null,
    profesorId: h.seccion.profesorId,
    profesorNombre: h.seccion.profesor
      ? `${h.seccion.profesor.nombres} ${h.seccion.profesor.apellidos}`
      : null,
    espacioFisicoId: h.espacioFisicoId,
    espacioFisicoNombre: h.espacioFisico ? h.espacioFisico.nombre : null,
    dia: h.dia,
    horaInicio: h.horaInicio,
    horaFin: h.horaFin,
    codigoSeccion: h.seccion.codigoSeccion,
    unidadCurricularId: h.seccion.unidadCurricularId,
    unidadCurricularNombre: h.seccion.unidadCurricular.nombre,
    pfgId: h.seccion.unidadCurricular.pfgId,
    turno: h.seccion.turno,
    sedeId: h.espacioFisico ? h.espacioFisico.sedeId : h.seccion.sedeId,
    sedeNombre: h.espacioFisico ? h.espacioFisico.sede.nombre : h.seccion.sede.nombre,
  }));

  let disponibilidades: DisponibilidadDocenteItem[] = [];
  if (seccion.profesorId) {
    const dispDB = await prisma.profesorDisponibilidad.findMany({
      where: { profesorId: seccion.profesorId, periodoId },
    });
    disponibilidades = dispDB.map((d) => ({
      profesorId: d.profesorId,
      dia: d.dia,
      horaInicio: d.horaInicio,
      horaFin: d.horaFin,
      disponible: d.disponible,
      prioridadPreferencia: d.prioridadPreferencia,
    }));
  }

  const propuesta = {
    horarioIdExcluir: horarioId || undefined,
    seccionId: seccion.id,
    grupoId: seccion.grupoId,
    profesorId: seccion.profesorId,
    espacioFisicoId: espacioPropuesto ? espacioPropuesto.id : null,
    dia,
    horaInicio,
    horaFin,
    sedeId: sedeEfectivaId,
    sedeNombre: sedeEfectivaNombre,
    esProyectoComunitario: seccion.unidadCurricular.esProyectoComunitario,
    unidadCurricularId: seccion.unidadCurricularId,
    unidadCurricularNombre: seccion.unidadCurricular.nombre,
    pfgId: seccion.unidadCurricular.pfgId,
    turno: seccion.turno,
    prelacionIds: seccion.unidadCurricular.prelacionesRequeridas.map((p) => p.preladaPorId),
    pisoMaximoDocente: seccion.profesor?.pisoMaximo,
    pisoNivelEspacio: espacioPropuesto?.pisoNivel ?? espacioPropuesto?.piso,
    diasPermitidosDocente: seccion.profesor?.diasDisponibles,
  };

  return { propuesta, resultado: validarAsignacionHoraria(propuesta, bloquesExistentes, disponibilidades) };
}

export class HorariosController {
  /**
   * Redirige /horarios al período activo más reciente
   */
  static async redirigirPeriodoActivo(req: Request, res: Response) {
    try {
      const periodo = await buscarPeriodoVigente();

      if (!periodo) {
        const destino = puedeProgramarHorarios(req.session?.usuario?.rol) ? '/periodos' : '/';
        return res.redirect(`${destino}?error=` + encodeURIComponent('No hay períodos académicos abiertos.'));
      }

      const avisos = ['msg', 'error']
        .filter((k) => typeof req.query[k] === 'string' && req.query[k])
        .map((k) => `${k}=${encodeURIComponent(req.query[k] as string)}`)
        .join('&');
      return res.redirect(`/periodos/${periodo.id}/horarios${avisos ? `?${avisos}` : ''}`);
    } catch (err) {
      console.error('[HORARIOS-REDIRECT-ERROR]', err);
      return res.redirect('/periodos');
    }
  }

  /**
   * Matriz Semanal de Horarios (Perspectiva Docente, Aula o Sección con discriminación por PFG)
   */
  static async matriz(req: Request, res: Response) {
    try {
      const { id: periodoId } = req.params;
      const filtroTipo = (req.query.tipo as string) || 'DOCENTE'; // 'DOCENTE', 'AULA', 'SECCION'
      const filtroId = (req.query.id as string) || '';
      // Spec 06: el coordinador elige y programa solo secciones de sus programas; los bloques
      // de otros programas se muestran como ocupados (solo lectura) porque consumen docentes y aulas.
      const alcance = alcanceDe(req);
      const pfgSolicitado = (req.query.pfgId as string) || '';
      const filtroPfgId = pfgSolicitado && puedeGestionarPfg(alcance, pfgSolicitado) ? pfgSolicitado : '';
      const pfgSecciones = filtroPfgEfectivo(alcance, filtroPfgId);

      const periodo = await prisma.periodoAcademico.findUnique({
        where: { id: periodoId },
      });

      if (!periodo) {
        return res.redirect('/periodos?error=' + encodeURIComponent('Período académico no encontrado.'));
      }

      const usuario = req.session?.usuario;
      const soloLectura = !puedeProgramarHorarios(usuario?.rol);
      // Spec 06: el docente consulta únicamente su propio horario (sin otras perspectivas ni docentes).
      const soloSuHorario = usuario?.rol === RolUsuario.DOCENTE;
      let profesorPropio: string | null = null;
      if (soloSuHorario) {
        profesorPropio = await profesorPropioId(usuario);
        if (!profesorPropio) {
          return res.status(403).render('pages/error', {
            title: 'Cuenta sin docente vinculado',
            statusCode: 403,
            mensaje:
              'Su cuenta no está vinculada a una ficha docente, por lo que no hay un horario que mostrar. Solicite a la Administración que la vincule.',
          });
        }
        if (filtroTipo !== 'DOCENTE' || filtroId !== profesorPropio || pfgSolicitado) {
          const pidioOtro = filtroTipo !== 'DOCENTE' || (filtroId !== '' && filtroId !== profesorPropio);
          const aviso = pidioOtro
            ? `&error=${encodeURIComponent(MENSAJE_SOLO_SU_HORARIO)}`
            : ['msg', 'error']
                .filter((k) => typeof req.query[k] === 'string' && req.query[k])
                .map((k) => `&${k}=${encodeURIComponent(req.query[k] as string)}`)
                .join('');
          return res.redirect(`/periodos/${periodoId}/horarios?tipo=DOCENTE&id=${profesorPropio}${aviso}`);
        }
      }

      // Catálogos para el selector de perspectiva y filtrado
      const [pfgs, profesores, espacios, seccionesPeriodo, todosHorarios, grupos] = await Promise.all([
        prisma.programaFormacion.findMany({
          where: { activo: true, id: filtroPfg(alcance) },
          orderBy: { nombre: 'asc' },
        }),
        prisma.profesor.findMany({
          where: { activo: true, ...(profesorPropio ? { id: profesorPropio } : {}) },
          orderBy: [{ apellidos: 'asc' }, { nombres: 'asc' }],
        }),
        prisma.espacioFisico.findMany({
          where: { activo: true },
          include: { sede: true },
          orderBy: [{ sede: { nombre: 'asc' } }, { nombre: 'asc' }],
        }),
        prisma.seccion.findMany({
          where: {
            periodoId,
            ...(pfgSecciones ? { unidadCurricular: { pfgId: pfgSecciones } } : {}),
          },
          include: {
            unidadCurricular: { include: { pfg: true, prelacionesRequeridas: true } },
            profesor: true,
            sede: true,
            horarios: true,
          },
          orderBy: { codigoSeccion: 'asc' },
        }),
        prisma.horarioSeccion.findMany({
          where: {
            seccion: {
              periodoId,
              ...(filtroPfgId ? { unidadCurricular: { pfgId: filtroPfgId } } : {}),
            },
          },
          include: {
            seccion: {
              include: {
                unidadCurricular: { include: { pfg: true, prelacionesRequeridas: true } },
                profesor: true,
                sede: true,
              },
            },
            espacioFisico: {
              include: { sede: true },
            },
          },
        }),
        prisma.grupoSeccion.findMany({
          where: { periodoId, ...(pfgSecciones ? { pfgId: pfgSecciones } : {}) },
          include: { pfg: { select: { codigo: true } } },
          orderBy: { codigoNormalizado: 'asc' },
        }),
      ]);

      // Filtrar los bloques a mostrar en la matriz según la vista seleccionada
      let horariosVisibles = todosHorarios;
      let entidadSeleccionadaNombre = 'Todos';

      if (filtroId) {
        if (filtroTipo === 'DOCENTE') {
          horariosVisibles = todosHorarios.filter((h) => h.seccion.profesorId === filtroId);
          const prof = profesores.find((p) => p.id === filtroId);
          if (prof) entidadSeleccionadaNombre = `Prof. ${prof.nombres} ${prof.apellidos}`;
        } else if (filtroTipo === 'AULA') {
          horariosVisibles = todosHorarios.filter((h) => h.espacioFisicoId === filtroId);
          const esp = espacios.find((e) => e.id === filtroId);
          if (esp) entidadSeleccionadaNombre = `${esp.nombre} (${esp.sede.nombre})`;
        } else if (filtroTipo === 'SECCION') {
          horariosVisibles = todosHorarios.filter((h) => h.seccionId === filtroId);
          const sec = seccionesPeriodo.find((s) => s.id === filtroId);
          if (sec) entidadSeleccionadaNombre = `Sección ${sec.codigoSeccion} (${sec.unidadCurricular.nombre})`;
        } else if (filtroTipo === 'GRUPO') {
          horariosVisibles = todosHorarios.filter((h) => h.seccion.grupoId === filtroId);
          const grupo = grupos.find((g) => g.id === filtroId);
          if (grupo) entidadSeleccionadaNombre = `Sección ${grupo.codigoNormalizado} (${grupo.pfg.codigo}) - todas sus UC`;
        }
      } else {
        // Por defecto seleccionar el primer docente, aula o sección si existe
        const queryPfg = filtroPfgId ? `&pfgId=${filtroPfgId}` : '';
        if (filtroTipo === 'DOCENTE' && profesores.length > 0) {
          return res.redirect(`/periodos/${periodoId}/horarios?tipo=DOCENTE&id=${profesores[0].id}${queryPfg}`);
        } else if (filtroTipo === 'AULA' && espacios.length > 0) {
          return res.redirect(`/periodos/${periodoId}/horarios?tipo=AULA&id=${espacios[0].id}${queryPfg}`);
        } else if (filtroTipo === 'SECCION' && seccionesPeriodo.length > 0) {
          return res.redirect(`/periodos/${periodoId}/horarios?tipo=SECCION&id=${seccionesPeriodo[0].id}${queryPfg}`);
        } else if (filtroTipo === 'GRUPO' && grupos.length > 0) {
          return res.redirect(`/periodos/${periodoId}/horarios?tipo=GRUPO&id=${grupos[0].id}${queryPfg}`);
        }
      }

      // Estructurar mapa [dia][horaInicio] para búsqueda O(1) en la vista
      const matrizMap: Record<string, Record<string, any>> = {};
      const diasSemana = [
        DiaSemana.LUNES,
        DiaSemana.MARTES,
        DiaSemana.MIERCOLES,
        DiaSemana.JUEVES,
        DiaSemana.VIERNES,
        DiaSemana.SABADO,
      ];

      diasSemana.forEach((d) => {
        matrizMap[d] = {};
      });

      horariosVisibles.forEach((h) => {
        if (matrizMap[h.dia]) {
          matrizMap[h.dia][h.horaInicio] = {
            id: h.id,
            seccionId: h.seccionId,
            codigoSeccion: h.seccion.codigoSeccion,
            unidadNombre: h.seccion.unidadCurricular.nombre,
            pfgCodigo: h.seccion.unidadCurricular.pfg?.codigo || 'UBV',
            pfgNombre: h.seccion.unidadCurricular.pfg?.nombre || '',
            profesorNombre: h.seccion.profesor
              ? `${h.seccion.profesor.nombres} ${h.seccion.profesor.apellidos}`
              : 'Sin Docente',
            profesorId: h.seccion.profesorId,
            espacioNombre: h.espacioFisico ? h.espacioFisico.nombre : 'Sin Aula (Campo)',
            espacioFisicoId: h.espacioFisicoId,
            sedeNombre: h.espacioFisico ? h.espacioFisico.sede.nombre : h.seccion.sede.nombre,
            tipoBloque: h.tipoBloque,
            horaInicio: h.horaInicio,
            horaFin: h.horaFin,
            horaInicio12: to12HourFormat(h.horaInicio),
            horaFin12: to12HourFormat(h.horaFin),
            editable: !soloLectura && puedeGestionarPfg(alcance, h.seccion.unidadCurricular.pfgId),
          };
        }
      });

      // Secciones pendientes de asignación (o que tienen 0 horarios asignados)
      const seccionesPendientes = pendientesDeVista(seccionesPeriodo, filtroTipo, filtroId, espacios);

      res.render('pages/horarios/matriz', {
        title: `Horario Semanal - ${periodo.codigo}`,
        periodo,
        filtroTipo,
        filtroId,
        filtroPfgId,
        pfgs,
        entidadSeleccionadaNombre,
        profesores,
        espacios,
        secciones: seccionesPeriodo,
        grupos,
        seccionesPendientes,
        soloLectura,
        soloSuHorario,
        dias: diasSemana,
        franjas: BLOQUES_HORARIOS_OFICIALES,
        matrizMap,
        mensaje: req.query.msg || null,
        error: req.query.error || null,
      });
    } catch (err) {
      console.error('[HORARIOS-MATRIZ-ERROR]', err);
      const destino = req.session?.usuario?.rol === RolUsuario.DOCENTE ? '/' : '/periodos';
      res.redirect(`${destino}?error=` + encodeURIComponent('Error al cargar la matriz de horarios.'));
    }
  }

  /**
   * Endpoint de validación en tiempo real para Drag & Drop (HTMX o JSON)
   */
  static async validarDrop(req: Request, res: Response) {
    try {
      const { id: periodoId } = req.params;
      const {
        seccionId,
        horarioId,
        dia,
        horaInicio,
        horaFin,
        espacioFisicoId,
      } = req.body;

      if (!seccionId || !dia || !horaInicio || !horaFin) {
        return res.status(400).json({
          esValido: false,
          mensaje: 'Parámetros incompletos para validación.',
        });
      }

      const seccion = await cargarSeccionHorario(periodoId, seccionId);

      if (!seccion) {
        return res.status(404).json({
          esValido: false,
          mensaje: 'Sección no encontrada en este período.',
        });
      }

      if (!puedeGestionarPfg(alcanceDe(req), seccion.unidadCurricular.pfgId)) {
        return denegarPfg(req, res);
      }

      const { propuesta, resultado } = await evaluarPropuestaHoraria(periodoId, seccion, {
        horarioId,
        dia,
        horaInicio,
        horaFin,
        espacioFisicoId,
      });

      // Si la petición es de HTMX, renderizar partial
      if (req.headers['hx-request']) {
        return res.render('partials/drop-feedback', {
          resultado,
          propuesta: {
            ...propuesta,
            horaInicio12: to12HourFormat(horaInicio),
            horaFin12: to12HourFormat(horaFin),
          },
        });
      }

      return res.json(resultado);
    } catch (err: any) {
      console.error('[VALIDAR-DROP-ERROR]', err);
      return res.status(500).json({
        esValido: false,
        mensaje: 'Error interno al validar restricciones horarias.',
      });
    }
  }

  /**
   * Persiste el movimiento o nueva asignación con auditoría de cambio
   */
  static async moverBloque(req: Request, res: Response) {
    try {
      const { id: periodoId } = req.params;
      const {
        seccionId,
        horarioId,
        dia,
        horaInicio,
        horaFin,
        espacioFisicoId,
        justificacion,
      } = req.body;

      const usuarioResponsable = req.session?.usuario?.email || 'sistema_admin';

      if (!seccionId || !dia || !horaInicio || !horaFin) {
        return res.status(400).json({ success: false, error: 'Parámetros incompletos para guardar el horario.' });
      }

      const seccion = await cargarSeccionHorario(periodoId, seccionId);

      if (!seccion) {
        return res.status(404).json({ success: false, error: 'Sección no encontrada en este período.' });
      }

      if (!puedeGestionarPfg(alcanceDe(req), seccion.unidadCurricular.pfgId)) {
        return denegarPfg(req, res);
      }

      // Evaluar si es proyecto comunitario
      const tipoBloque = seccion.unidadCurricular.esProyectoComunitario
        ? TipoBloqueAcademico.PROYECTO_COMUNITARIO
        : TipoBloqueAcademico.DOCENCIA_AULA;

      const aulaAsignar = seccion.unidadCurricular.esProyectoComunitario ? null : (espacioFisicoId || null);
      const esMovimiento = typeof horarioId === 'string' && horarioId.trim() !== '';

      const horarioAnterior = esMovimiento
        ? await prisma.horarioSeccion.findFirst({ where: { id: horarioId, seccionId } })
        : null;
      if (esMovimiento && !horarioAnterior) {
        return res.status(404).json({ success: false, error: 'El bloque indicado no pertenece a esta sección.' });
      }

      // Restricciones duras evaluadas también en el servidor: el cliente no puede omitirlas
      const { resultado } = await evaluarPropuestaHoraria(periodoId, seccion, {
        horarioId: esMovimiento ? horarioId : undefined,
        dia,
        horaInicio,
        horaFin,
        espacioFisicoId: aulaAsignar,
      });
      if (!resultado.esValido) {
        return res.status(409).json({
          success: false,
          error: resultado.mensajeResumen,
          conflictos: resultado.conflictos,
        });
      }

      let horarioGuardado: any = null;
      let datosAnterioresStr: string | null = null;

      if (esMovimiento) {
        // Movimiento de bloque existente
        datosAnterioresStr = JSON.stringify(horarioAnterior);

        horarioGuardado = await prisma.horarioSeccion.update({
          where: { id: horarioId },
          data: {
            dia,
            horaInicio,
            horaFin,
            espacioFisicoId: aulaAsignar,
            tipoBloque,
          },
        });

        // Registro de Auditoría
        await prisma.auditoriaAjusteHorario.create({
          data: {
            periodoId,
            seccionId,
            horarioSeccionId: horarioId,
            usuarioResponsable,
            tipoOperacion: 'AJUSTE_MANUAL_MOVIMIENTO',
            datosAnteriores: datosAnterioresStr,
            datosNuevos: JSON.stringify(horarioGuardado),
            justificacionResolucion: justificacion || 'Reorganización manual de cohorte',
          },
        });
      } else {
        // Inserción de nueva asignación para la sección
        horarioGuardado = await prisma.horarioSeccion.create({
          data: {
            seccionId,
            espacioFisicoId: aulaAsignar,
            dia,
            horaInicio,
            horaFin,
            tipoBloque,
          },
        });

        // Registro de Auditoría
        await prisma.auditoriaAjusteHorario.create({
          data: {
            periodoId,
            seccionId,
            horarioSeccionId: horarioGuardado.id,
            usuarioResponsable,
            tipoOperacion: 'ASIGNACION_NUEVA_BLOQUE',
            datosAnteriores: null,
            datosNuevos: JSON.stringify(horarioGuardado),
            justificacionResolucion: justificacion || 'Asignación manual en matriz',
          },
        });
      }

      return res.json({
        success: true,
        mensaje: 'Horario actualizado exitosamente.',
        horario: horarioGuardado,
      });
    } catch (err: any) {
      console.error('[MOVER-BLOQUE-ERROR]', err);
      return res.status(500).json({
        success: false,
        error: err.message || 'Error al persistir el horario.',
      });
    }
  }

  /**
   * Eliminar bloque de horario y devolver sección a pendientes
   */
  static async eliminarBloque(req: Request, res: Response) {
    try {
      const { id: periodoId } = req.params;
      const { horarioId, justificacion } = req.body;
      const usuarioResponsable = req.session?.usuario?.email || 'sistema_admin';

      const horario = await prisma.horarioSeccion.findFirst({
        where: { id: horarioId, seccion: { periodoId } },
        include: { seccion: { include: { unidadCurricular: { select: { pfgId: true } } } } },
      });

      if (!horario) {
        return res.status(404).json({ success: false, error: 'Bloque de horario no encontrado en este período.' });
      }

      if (!puedeGestionarPfg(alcanceDe(req), horario.seccion.unidadCurricular.pfgId)) {
        return denegarPfg(req, res);
      }

      await prisma.auditoriaAjusteHorario.create({
        data: {
          periodoId,
          seccionId: horario.seccionId,
          horarioSeccionId: horarioId,
          usuarioResponsable,
          tipoOperacion: 'ELIMINACION_BLOQUE',
          datosAnteriores: JSON.stringify(horario),
          datosNuevos: null,
          justificacionResolucion: justificacion || 'Bloque desasignado manualmente',
        },
      });

      await prisma.horarioSeccion.delete({
        where: { id: horarioId },
      });

      return res.json({
        success: true,
        mensaje: 'Bloque de horario eliminado.',
      });
    } catch (err: any) {
      console.error('[ELIMINAR-BLOQUE-ERROR]', err);
      return res.status(500).json({
        success: false,
        error: err.message || 'Error al eliminar bloque.',
      });
    }
  }
}
