import { Request, Response } from 'express';
import { SolverService } from '../solverService';
import prisma from '../../../core/database/prisma';

export class SolverController {
  /**
   * Diagnóstico preliminar de factibilidad para las secciones vacantes del período
   */
  static async diagnostico(req: Request, res: Response) {
    try {
      const { id: periodoId } = req.params;

      const periodo = await prisma.periodoAcademico.findUnique({
        where: { id: periodoId },
        include: {
          _count: {
            select: {
              secciones: true,
              dedicaciones: true,
              disponibilidades: true,
            },
          },
        },
      });

      if (!periodo) {
        return res.status(404).json({ ok: false, error: 'Período académico no encontrado' });
      }

      const seccionesPendientes = await prisma.seccion.findMany({
        where: {
          periodoId,
          horarios: { none: {} },
        },
        include: {
          unidadCurricular: true,
          profesor: true,
          sede: true,
        },
      });

      const totalHorasPendientes = seccionesPendientes.reduce((acc, s) => {
        const uc = s.unidadCurricular;
        return (
          acc +
          uc.horasTeoricasSemanales +
          uc.horasPracticasSemanales +
          uc.horasCampoComunitarioSemanales
        );
      }, 0);

      const totalBloquesRequeridos = seccionesPendientes.reduce((acc, s) => {
        const uc = s.unidadCurricular;
        const totalH =
          uc.horasTeoricasSemanales +
          uc.horasPracticasSemanales +
          uc.horasCampoComunitarioSemanales;
        return acc + Math.max(1, Math.round(totalH / 2));
      }, 0);

      const seccionesSinProfesor = seccionesPendientes.filter((s) => !s.profesorId);

      res.json({
        ok: true,
        periodo: {
          id: periodo.id,
          codigo: periodo.codigo,
          nombre: periodo.nombre,
          estado: periodo.estado,
        },
        metricas: {
          totalSecciones: periodo._count.secciones,
          seccionesPendientes: seccionesPendientes.length,
          totalHorasPendientes,
          totalBloquesRequeridos,
          seccionesSinProfesor: seccionesSinProfesor.length,
          disponibilidadesRegistradas: periodo._count.disponibilidades,
        },
        secciones: seccionesPendientes.map((s) => ({
          id: s.id,
          codigoSeccion: s.codigoSeccion,
          materia: s.unidadCurricular.nombre,
          sede: s.sede.nombre,
          profesor: s.profesor ? `${s.profesor.nombres} ${s.profesor.apellidos}` : 'No asignado',
          cupos: s.cuposEstimados,
          tipoEspacio: s.unidadCurricular.tipoEspacioRequerido,
          esProyecto: s.unidadCurricular.esProyectoComunitario,
        })),
      });
    } catch (err: any) {
      console.error('[SOLVER-DIAGNOSTICO-ERROR]', err);
      res.status(500).json({ ok: false, error: err.message || 'Error en diagnóstico' });
    }
  }

  /**
   * Ejecuta la optimización automática
   */
  static async ejecutar(req: Request, res: Response) {
    try {
      const { id: periodoId } = req.params;
      const {
        autoAplicar = false,
        tamanoPoblacion = 40,
        maxGeneraciones = 80,
        timeoutMs = 10000,
        motor = 'CP_SAT',
      } = req.body;

      const usuarioNombre = (req.session as any)?.user?.email || 'SISTEMA_SOLVER';

      const resultado = await SolverService.optimizarPeriodo(periodoId, {
        tamanoPoblacion: Number(tamanoPoblacion),
        maxGeneraciones: Number(maxGeneraciones),
        timeoutMs: Number(timeoutMs),
        motor: motor === 'GENETICO' ? 'GENETICO' : 'CP_SAT',
      });

      let aplicados = 0;
      if (autoAplicar && resultado.status !== 'INFEASIBLE') {
        const resAplicar = await SolverService.aplicarPropuesta(
          periodoId,
          usuarioNombre,
          resultado
        );
        aplicados = resAplicar.aplicados;
      }

      res.json({
        ok: true,
        resultado,
        aplicados,
        mensaje:
          resultado.status === 'INFEASIBLE'
            ? 'El solver encontró cuellos de botella que impiden una asignación 100% libre de conflictos.'
            : aplicados > 0
            ? `Se calendarizaron y guardaron exitosamente ${resultado.totalBloquesAsignados} bloques para ${resultado.totalSeccionesCalendarizadas} secciones.`
            : `Propuesta generada exitosamente (${resultado.status}) con 0 violaciones duras. Lista para aplicar.`,
      });
    } catch (err: any) {
      console.error('[SOLVER-EJECUTAR-ERROR]', err);
      res.status(500).json({ ok: false, error: err.message || 'Error en ejecución de solver' });
    }
  }

  /**
   * Aplica una propuesta previamente aprobada por el usuario
   */
  static async aplicar(req: Request, res: Response) {
    try {
      const { id: periodoId } = req.params;
      const { propuesta } = req.body;

      if (!propuesta || !Array.isArray(propuesta.asignaciones)) {
        return res.status(400).json({ ok: false, error: 'Propuesta inválida o incompleta' });
      }

      const usuarioNombre = (req.session as any)?.user?.email || 'ADMINISTRADOR';

      const resAplicar = await SolverService.aplicarPropuesta(
        periodoId,
        usuarioNombre,
        propuesta
      );

      res.json({
        ok: true,
        aplicados: resAplicar.aplicados,
        mensaje: `Se aplicaron exitosamente ${resAplicar.aplicados} bloques de horario a la base de datos.`,
      });
    } catch (err: any) {
      console.error('[SOLVER-APLICAR-ERROR]', err);
      res.status(500).json({ ok: false, error: err.message || 'Error al aplicar horarios' });
    }
  }
}
