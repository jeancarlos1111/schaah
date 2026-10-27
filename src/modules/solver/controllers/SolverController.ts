import { Request, Response } from 'express';
import { AsignacionFueraDeAlcanceError, SolverService } from '../solverService';
import prisma from '../../../core/database/prisma';
import { filtroPfg } from '../../../core/domain/rules/alcancePfgRules';
import { alcanceDe } from '../../auth/middlewares/alcancePfg';
import {
  SeccionDiagnostico,
  bloquesRequeridosPorHoras,
  diagnosticarFactibilidad,
  horasSemanalesSeccion,
} from '../../../core/domain/rules/diagnosticoFactibilidad';

/**
 * Programas a los que se limita el solver (Spec 06).
 * - Coordinador: siempre sus programas del alcance.
 * - Admin / Planificador: todos, o el `pfgId` opcional del filtro de la matriz / cuerpo JSON.
 */
function pfgIdsSolver(req: Request): string[] | undefined {
  const delAlcance = filtroPfg(alcanceDe(req))?.in;
  const pedidoRaw = (req.body?.pfgId ?? req.query?.pfgId) as string | string[] | undefined;
  const pedido = Array.isArray(pedidoRaw) ? pedidoRaw[0] : pedidoRaw;
  const pfgPedido = typeof pedido === 'string' && pedido.trim() ? pedido.trim() : undefined;

  if (delAlcance) {
    if (pfgPedido && delAlcance.includes(pfgPedido)) return [pfgPedido];
    return delAlcance;
  }
  if (pfgPedido) return [pfgPedido];
  return undefined;
}

export class SolverController {
  /**
   * Diagnóstico preliminar de factibilidad para las secciones vacantes del período
   */
  static async diagnostico(req: Request, res: Response) {
    try {
      const { id: periodoId } = req.params;
      const pfgIds = pfgIdsSolver(req);
      const whereAlcance = pfgIds ? { unidadCurricular: { pfgId: { in: pfgIds } } } : {};

      const periodo = await prisma.periodoAcademico.findUnique({
        where: { id: periodoId },
        include: {
          _count: {
            select: {
              secciones: { where: whereAlcance },
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
          ...whereAlcance,
        },
        include: {
          unidadCurricular: true,
          profesor: true,
          sede: true,
        },
        orderBy: { codigoSeccion: 'asc' },
      });

      const seccionesDiagnostico: SeccionDiagnostico[] = seccionesPendientes.map((s) => ({
        codigoSeccion: s.codigoSeccion,
        nombreMateria: s.unidadCurricular.nombre,
        profesorId: s.profesorId,
        profesorNombre: s.profesor ? `${s.profesor.nombres} ${s.profesor.apellidos}` : null,
        sedeId: s.sedeId,
        cuposEstimados: s.cuposEstimados,
        bloquesRequeridos: bloquesRequeridosPorHoras(horasSemanalesSeccion(s.horasSemanalesOferta, s.unidadCurricular)),
        tipoEspacioRequerido: s.unidadCurricular.tipoEspacioRequerido,
        esProyectoComunitario: s.unidadCurricular.esProyectoComunitario,
      }));
      const totalHorasPendientes = seccionesPendientes.reduce(
        (acc, s) => acc + horasSemanalesSeccion(s.horasSemanalesOferta, s.unidadCurricular),
        0
      );
      const totalBloquesRequeridos = seccionesDiagnostico.reduce((acc, s) => acc + s.bloquesRequeridos, 0);

      const profesorIds = [...new Set(seccionesPendientes.map((s) => s.profesorId).filter((id): id is string => !!id))];
      const [franjas, espacios] = await Promise.all([
        prisma.profesorDisponibilidad.groupBy({
          by: ['profesorId'],
          where: { periodoId, disponible: true, profesorId: { in: profesorIds } },
          _count: { _all: true },
        }),
        prisma.espacioFisico.findMany({ where: { activo: true }, select: { sedeId: true, tipo: true, capacidad: true } }),
      ]);
      const diagnostico = diagnosticarFactibilidad(
        seccionesDiagnostico,
        new Map(franjas.map((f) => [f.profesorId, f._count._all])),
        espacios
      );

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
          seccionesSinProfesor: diagnostico.seccionesSinDocente,
          seccionesSinAula: diagnostico.seccionesSinAula,
          docentesAsignados: diagnostico.docentesAsignados,
          docentesConDisponibilidad: diagnostico.docentesConDisponibilidad,
          disponibilidadesRegistradas: periodo._count.disponibilidades,
        },
        factible: diagnostico.factible,
        avisos: diagnostico.avisos,
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

      const usuarioNombre = req.session?.usuario?.email || 'SISTEMA_SOLVER';
      const pfgIds = pfgIdsSolver(req);

      const resultado = await SolverService.optimizarPeriodo(
        periodoId,
        {
          tamanoPoblacion: Number(tamanoPoblacion),
          maxGeneraciones: Number(maxGeneraciones),
          timeoutMs: Number(timeoutMs),
          motor: motor === 'GENETICO' ? 'GENETICO' : 'CP_SAT',
        },
        { pfgIds }
      );

      let aplicados = 0;
      if (autoAplicar && resultado.status !== 'INFEASIBLE') {
        const resAplicar = await SolverService.aplicarPropuesta(
          periodoId,
          usuarioNombre,
          resultado,
          { pfgIds }
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

      const usuarioNombre = req.session?.usuario?.email || 'ADMINISTRADOR';

      const resAplicar = await SolverService.aplicarPropuesta(
        periodoId,
        usuarioNombre,
        propuesta,
        { pfgIds: pfgIdsSolver(req) }
      );

      res.json({
        ok: true,
        aplicados: resAplicar.aplicados,
        mensaje: `Se aplicaron exitosamente ${resAplicar.aplicados} bloques de horario a la base de datos.`,
      });
    } catch (err: any) {
      if (err instanceof AsignacionFueraDeAlcanceError) {
        return res.status(403).json({ ok: false, error: err.message });
      }
      console.error('[SOLVER-APLICAR-ERROR]', err);
      res.status(500).json({ ok: false, error: err.message || 'Error al aplicar horarios' });
    }
  }
}
