import { PrismaClient } from '@prisma/client';
import prisma from '../../core/database/prisma';
import { GeneticSolverEngine } from './geneticEngine';
import { bloquesRequeridosPorHoras, horasSemanalesSeccion } from '../../core/domain/rules/diagnosticoFactibilidad';
import {
  BloqueOcupadoExistente,
  DocenteSolverData,
  EspacioSolverData,
  SeccionSolverData,
  SolverInput,
  SolverOptions,
  SolverResult,
} from './types';

/**
 * Alcance de una corrida del solver (Spec 06): `pfgIds` limita las secciones a programar a
 * esos programas; los horarios ya guardados de cualquier programa siguen ocupando
 * docentes, aulas y cohortes. `db` permite inyectar otra conexión (pruebas).
 */
export interface ContextoSolver {
  pfgIds?: string[];
  db?: PrismaClient;
}

export class AsignacionFueraDeAlcanceError extends Error {}

export class SolverService {
  /**
   * Prepara los datos del período y ejecuta la optimización
   */
  static async optimizarPeriodo(
    periodoId: string,
    options?: SolverOptions,
    contexto: ContextoSolver = {}
  ): Promise<SolverResult> {
    const db = contexto.db ?? prisma;
    // 1. Obtener secciones pendientes del período (aquellas que no tienen horarios asignados)
    const seccionesPendientesRaw = await db.seccion.findMany({
      where: {
        periodoId,
        horarios: { none: {} },
        ...(contexto.pfgIds ? { unidadCurricular: { pfgId: { in: contexto.pfgIds } } } : {}),
      },
      include: {
        unidadCurricular: true,
        profesor: true,
        sede: true,
        grupo: { select: { codigoNormalizado: true } },
      },
    });

    // 2. Obtener horarios ya existentes en este período (restricciones fijas)
    const horariosExistentesRaw = await db.horarioSeccion.findMany({
      where: {
        seccion: { periodoId },
      },
      include: {
        seccion: { include: { grupo: { select: { codigoNormalizado: true } } } },
      },
    });

    const horariosExistentes: BloqueOcupadoExistente[] = horariosExistentesRaw.map((h) => ({
      id: h.id,
      seccionId: h.seccionId,
      codigoSeccion: h.seccion.codigoSeccion,
      grupoId: h.seccion.grupoId,
      grupoCodigo: h.seccion.grupo?.codigoNormalizado ?? null,
      profesorId: h.seccion.profesorId,
      espacioFisicoId: h.espacioFisicoId,
      sedeId: h.seccion.sedeId,
      dia: h.dia,
      horaInicio: h.horaInicio,
      horaFin: h.horaFin,
    }));

    // 3. Mapear secciones a SeccionSolverData
    const seccionesPendientes: SeccionSolverData[] = seccionesPendientesRaw.map((s) => {
      const uc = s.unidadCurricular;
      const totalHoras = horasSemanalesSeccion(s.horasSemanalesOferta, uc);
      const bloquesRequeridos = bloquesRequeridosPorHoras(totalHoras);

      return {
        id: s.id,
        grupoId: s.grupoId,
        grupoCodigo: s.grupo?.codigoNormalizado ?? null,
        codigoSeccion: s.codigoSeccion,
        unidadCurricularId: s.unidadCurricularId,
        nombreMateria: uc.nombre,
        sedeId: s.sedeId,
        profesorId: s.profesorId,
        profesorNombre: s.profesor ? `${s.profesor.nombres} ${s.profesor.apellidos}` : undefined,
        turno: s.turno,
        cuposEstimados: s.cuposEstimados,
        totalHorasAcademicas: totalHoras,
        bloquesRequeridos,
        tipoEspacioRequerido: uc.tipoEspacioRequerido,
        esProyectoComunitario: uc.esProyectoComunitario,
      };
    });

    // 4. Obtener profesores y sus disponibilidades
    const profesoresRaw = await db.profesor.findMany({
      where: { activo: true },
      include: {
        disponibilidades: {
          where: { periodoId },
        },
        dedicaciones: {
          where: { periodoId },
        },
      },
    });

    const docentesMap = new Map<string, DocenteSolverData>();
    for (const p of profesoresRaw) {
      const ded = p.dedicaciones[0];
      let diasDisponiblesArray: string[] | null = null;
      if (p.diasDisponibles) {
        try {
          const parsed = JSON.parse(p.diasDisponibles);
          if (Array.isArray(parsed)) diasDisponiblesArray = parsed;
        } catch {
          diasDisponiblesArray = p.diasDisponibles.split(',').map((d) => d.trim());
        }
      }

      docentesMap.set(p.id, {
        id: p.id,
        cedula: p.cedula,
        nombreCompleto: `${p.nombres} ${p.apellidos}`,
        dedicacion: ded?.dedicacion,
        minHorasDocenciaDirecta: ded?.minHorasDocenciaDirecta,
        maxHorasDocenciaDirecta: ded?.maxHorasDocenciaDirecta,
        sedePrincipalId: ded?.sedeAdscripcionPrincipalId,
        pisoMaximo: p.pisoMaximo,
        motivoRestriccionPiso: p.motivoRestriccionPiso,
        diasDisponibles: diasDisponiblesArray,
        disponibilidades: p.disponibilidades.map((d) => ({
          dia: d.dia,
          horaInicio: d.horaInicio,
          horaFin: d.horaFin,
          disponible: d.disponible,
          prioridadPreferencia: d.prioridadPreferencia,
        })),
      });
    }

    // 5. Obtener espacios físicos activos
    const espaciosRaw = await db.espacioFisico.findMany({
      where: { activo: true },
    });

    const espacios: EspacioSolverData[] = espaciosRaw.map((e) => ({
      id: e.id,
      codigo: e.codigo,
      nombre: e.nombre,
      tipo: e.tipo,
      capacidad: e.capacidad,
      sedeId: e.sedeId,
      piso: e.piso,
      pisoNivel: e.pisoNivel ?? 0,
      activa: e.activo,
    }));

    const sedesRaw = await db.sede.findMany({ select: { id: true, nombre: true } });

    const input: SolverInput = {
      periodoId,
      seccionesPendientes,
      docentes: docentesMap,
      espacios,
      horariosExistentes,
      nombresSedes: new Map(sedesRaw.map((s) => [s.id, s.nombre])),
    };

    // 6. Instanciar y ejecutar el motor seleccionado (CP-SAT WASM por defecto)
    let resultado: SolverResult;
    const motor = options?.motor ?? 'CP_SAT';

    if (motor === 'GENETICO') {
      const engine = new GeneticSolverEngine(input, options);
      resultado = engine.resolver();
      resultado.metricas.motorUtilizado = 'GENETICO';
    } else {
      const { CpSatSolverEngine } = await import('./cpSatEngine');
      const engine = new CpSatSolverEngine(input, options);
      resultado = await engine.resolver();
      resultado.metricas.motorUtilizado = 'CP_SAT';
    }

    return resultado;
  }

  /**
   * Aplica en base de datos la propuesta generada por el solver
   */
  static async aplicarPropuesta(
    periodoId: string,
    usuarioResponsable: string,
    resultado: Pick<SolverResult, 'asignaciones'>,
    contexto: ContextoSolver = {}
  ): Promise<{ aplicados: number }> {
    const db = contexto.db ?? prisma;
    if (resultado.asignaciones.length === 0) {
      return { aplicados: 0 };
    }

    // Cada bloque debe ser de una sección del período y, si hay alcance, de los programas permitidos
    const seccionIds = [...new Set(resultado.asignaciones.map((a) => a.seccionId))];
    const permitidas = await db.seccion.count({
      where: {
        id: { in: seccionIds },
        periodoId,
        ...(contexto.pfgIds ? { unidadCurricular: { pfgId: { in: contexto.pfgIds } } } : {}),
      },
    });
    if (permitidas !== seccionIds.length) {
      throw new AsignacionFueraDeAlcanceError(
        'La propuesta incluye secciones que no pertenecen a este período o a los programas que usted coordina.'
      );
    }

    await db.$transaction(async (tx) => {
      for (const asig of resultado.asignaciones) {
        // 1. Crear el registro en HorarioSeccion
        const nuevoHorario = await tx.horarioSeccion.create({
          data: {
            seccionId: asig.seccionId,
            espacioFisicoId: asig.espacioFisicoId,
            dia: asig.dia,
            horaInicio: asig.horaInicio,
            horaFin: asig.horaFin,
            tipoBloque: asig.tipoBloque,
          },
        });

        // 2. Registrar en auditoría
        await tx.auditoriaAjusteHorario.create({
          data: {
            periodoId,
            seccionId: asig.seccionId,
            horarioSeccionId: nuevoHorario.id,
            usuarioResponsable,
            tipoOperacion: 'ASIGNACION_AUTOMATICA_SOLVER',
            datosNuevos: JSON.stringify({
              dia: asig.dia,
              horaInicio: asig.horaInicio,
              horaFin: asig.horaFin,
              espacioFisicoId: asig.espacioFisicoId,
              codigoEspacio: asig.codigoEspacio,
              profesorNombre: asig.profesorNombre,
            }),
            justificacionResolucion:
              'Asignación optimizada automática generada por motor solver genético SAHAD UBV cumpliendo restricciones H-01 a H-09.',
          },
        });
      }
    });

    return { aplicados: resultado.asignaciones.length };
  }
}
