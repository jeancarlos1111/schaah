import { Request, Response } from 'express';
import prisma from '../../../core/database/prisma';
import { DiaSemana, TipoBloqueAcademico } from '../../../core/domain/enums';
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

export class HorariosController {
  /**
   * Redirige /horarios al período activo más reciente
   */
  static async redirigirPeriodoActivo(req: Request, res: Response) {
    try {
      const periodo = await prisma.periodoAcademico.findFirst({
        where: { estado: { in: ['ACTIVO', 'PLANIFICACION', 'BORRADOR'] } },
        orderBy: { createdAt: 'desc' },
      });

      if (!periodo) {
        return res.redirect('/periodos?error=' + encodeURIComponent('No hay períodos académicos registrados.'));
      }

      return res.redirect(`/periodos/${periodo.id}/horarios`);
    } catch (err) {
      console.error('[HORARIOS-REDIRECT-ERROR]', err);
      return res.redirect('/periodos');
    }
  }

  /**
   * Matriz Semanal de Horarios (Perspectiva Docente, Aula o Sección)
   */
  static async matriz(req: Request, res: Response) {
    try {
      const { id: periodoId } = req.params;
      const filtroTipo = (req.query.tipo as string) || 'DOCENTE'; // 'DOCENTE', 'AULA', 'SECCION'
      const filtroId = (req.query.id as string) || '';

      const periodo = await prisma.periodoAcademico.findUnique({
        where: { id: periodoId },
      });

      if (!periodo) {
        return res.redirect('/periodos?error=' + encodeURIComponent('Período académico no encontrado.'));
      }

      // Catálogos para el selector de perspectiva
      const [profesores, espacios, seccionesPeriodo, todosHorarios] = await Promise.all([
        prisma.profesor.findMany({
          where: { activo: true },
          orderBy: [{ apellidos: 'asc' }, { nombres: 'asc' }],
        }),
        prisma.espacioFisico.findMany({
          where: { activo: true },
          include: { sede: true },
          orderBy: [{ sede: { nombre: 'asc' } }, { nombre: 'asc' }],
        }),
        prisma.seccion.findMany({
          where: { periodoId },
          include: {
            unidadCurricular: { include: { pfg: true } },
            profesor: true,
            sede: true,
            horarios: true,
          },
          orderBy: { codigoSeccion: 'asc' },
        }),
        prisma.horarioSeccion.findMany({
          where: { seccion: { periodoId } },
          include: {
            seccion: {
              include: {
                unidadCurricular: true,
                profesor: true,
                sede: true,
              },
            },
            espacioFisico: {
              include: { sede: true },
            },
          },
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
          if (esp) entidadSeleccionadaNombre = `Aula ${esp.nombre} (${esp.sede.nombre})`;
        } else if (filtroTipo === 'SECCION') {
          horariosVisibles = todosHorarios.filter((h) => h.seccionId === filtroId);
          const sec = seccionesPeriodo.find((s) => s.id === filtroId);
          if (sec) entidadSeleccionadaNombre = `Sección ${sec.codigoSeccion} (${sec.unidadCurricular.nombre})`;
        }
      } else {
        // Por defecto seleccionar el primer docente, aula o sección si existe
        if (filtroTipo === 'DOCENTE' && profesores.length > 0) {
          return res.redirect(`/periodos/${periodoId}/horarios?tipo=DOCENTE&id=${profesores[0].id}`);
        } else if (filtroTipo === 'AULA' && espacios.length > 0) {
          return res.redirect(`/periodos/${periodoId}/horarios?tipo=AULA&id=${espacios[0].id}`);
        } else if (filtroTipo === 'SECCION' && seccionesPeriodo.length > 0) {
          return res.redirect(`/periodos/${periodoId}/horarios?tipo=SECCION&id=${seccionesPeriodo[0].id}`);
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
          };
        }
      });

      // Secciones pendientes de asignación (o que tienen 0 horarios asignados)
      const seccionesPendientes = seccionesPeriodo.filter((s) => s.horarios.length === 0);

      res.render('pages/horarios/matriz', {
        title: `Horario Semanal - ${periodo.codigo}`,
        periodo,
        filtroTipo,
        filtroId,
        entidadSeleccionadaNombre,
        profesores,
        espacios,
        secciones: seccionesPeriodo,
        seccionesPendientes,
        dias: diasSemana,
        franjas: BLOQUES_HORARIOS_OFICIALES,
        matrizMap,
        mensaje: req.query.msg || null,
        error: req.query.error || null,
      });
    } catch (err) {
      console.error('[HORARIOS-MATRIZ-ERROR]', err);
      res.redirect('/periodos?error=' + encodeURIComponent('Error al cargar la matriz de horarios.'));
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

      const seccion = await prisma.seccion.findUnique({
        where: { id: seccionId },
        include: {
          unidadCurricular: true,
          profesor: true,
          sede: true,
        },
      });

      if (!seccion) {
        return res.status(404).json({
          esValido: false,
          mensaje: 'Sección no encontrada.',
        });
      }

      // Espacio físico propuesto (o null)
      let espacioPropuesto: any = null;
      if (espacioFisicoId && espacioFisicoId.trim() !== '') {
        espacioPropuesto = await prisma.espacioFisico.findUnique({
          where: { id: espacioFisicoId },
          include: { sede: true },
        });
      }

      // Sede efectiva de la clase propuesta
      const sedeEfectivaId = espacioPropuesto ? espacioPropuesto.sedeId : seccion.sedeId;
      const sedeEfectivaNombre = espacioPropuesto ? espacioPropuesto.sede.nombre : seccion.sede.nombre;

      // Cargar todos los horarios del período para cotejo de conflictos
      const horariosDB = await prisma.horarioSeccion.findMany({
        where: { seccion: { periodoId } },
        include: {
          seccion: {
            include: {
              profesor: true,
              unidadCurricular: true,
              sede: true,
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
        unidadCurricularNombre: h.seccion.unidadCurricular.nombre,
        sedeId: h.espacioFisico ? h.espacioFisico.sedeId : h.seccion.sedeId,
        sedeNombre: h.espacioFisico ? h.espacioFisico.sede.nombre : h.seccion.sede.nombre,
      }));

      // Disponibilidad del docente
      let disponibilidades: DisponibilidadDocenteItem[] = [];
      if (seccion.profesorId) {
        const dispDB = await prisma.profesorDisponibilidad.findMany({
          where: {
            profesorId: seccion.profesorId,
            periodoId,
          },
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
        seccionId,
        profesorId: seccion.profesorId,
        espacioFisicoId: espacioPropuesto ? espacioPropuesto.id : null,
        dia,
        horaInicio,
        horaFin,
        sedeId: sedeEfectivaId,
        sedeNombre: sedeEfectivaNombre,
        esProyectoComunitario: seccion.unidadCurricular.esProyectoComunitario,
      };

      const resultado = validarAsignacionHoraria(propuesta, bloquesExistentes, disponibilidades);

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

      const usuarioResponsable = (req.session as any)?.usuario?.email || 'sistema_admin';

      const seccion = await prisma.seccion.findUnique({
        where: { id: seccionId },
        include: { unidadCurricular: true, profesor: true, sede: true },
      });

      if (!seccion) {
        return res.status(404).json({ success: false, error: 'Sección no encontrada.' });
      }

      // Evaluar si es proyecto comunitario
      const tipoBloque = seccion.unidadCurricular.esProyectoComunitario
        ? TipoBloqueAcademico.PROYECTO_COMUNITARIO
        : TipoBloqueAcademico.DOCENCIA_AULA;

      const aulaAsignar = seccion.unidadCurricular.esProyectoComunitario ? null : (espacioFisicoId || null);

      let horarioGuardado: any = null;
      let datosAnterioresStr: string | null = null;

      if (horarioId && horarioId.trim() !== '') {
        // Movimiento de bloque existente
        const horarioAnterior = await prisma.horarioSeccion.findUnique({
          where: { id: horarioId },
        });
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
      const usuarioResponsable = (req.session as any)?.usuario?.email || 'sistema_admin';

      const horario = await prisma.horarioSeccion.findUnique({
        where: { id: horarioId },
        include: { seccion: true },
      });

      if (!horario) {
        return res.status(404).json({ success: false, error: 'Bloque de horario no encontrado.' });
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
