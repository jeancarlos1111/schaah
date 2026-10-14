import prisma from '../../core/database/prisma';
import { GeneticSolverEngine } from './geneticEngine';
import {
  BloqueOcupadoExistente,
  DocenteSolverData,
  EspacioSolverData,
  SeccionSolverData,
  SolverInput,
  SolverOptions,
  SolverResult,
} from './types';

export class SolverService {
  /**
   * Prepara los datos del período y ejecuta la optimización
   */
  static async optimizarPeriodo(
    periodoId: string,
    options?: SolverOptions
  ): Promise<SolverResult> {
    // 1. Obtener secciones pendientes del período (aquellas que no tienen horarios asignados)
    const seccionesPendientesRaw = await prisma.seccion.findMany({
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

    // 2. Obtener horarios ya existentes en este período (restricciones fijas)
    const horariosExistentesRaw = await prisma.horarioSeccion.findMany({
      where: {
        seccion: { periodoId },
      },
      include: {
        seccion: true,
      },
    });

    const horariosExistentes: BloqueOcupadoExistente[] = horariosExistentesRaw.map((h) => ({
      id: h.id,
      seccionId: h.seccionId,
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
      const totalHoras =
        uc.horasTeoricasSemanales +
        uc.horasPracticasSemanales +
        uc.horasCampoComunitarioSemanales;
      // Cada bloque oficial es de 90 min (2 horas académicas)
      const bloquesRequeridos = Math.max(1, Math.round(totalHoras / 2));

      return {
        id: s.id,
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
    const profesoresRaw = await prisma.profesor.findMany({
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
      docentesMap.set(p.id, {
        id: p.id,
        cedula: p.cedula,
        nombreCompleto: `${p.nombres} ${p.apellidos}`,
        dedicacion: ded?.dedicacion,
        minHorasDocenciaDirecta: ded?.minHorasDocenciaDirecta,
        maxHorasDocenciaDirecta: ded?.maxHorasDocenciaDirecta,
        sedePrincipalId: ded?.sedeAdscripcionPrincipalId,
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
    const espaciosRaw = await prisma.espacioFisico.findMany({
      where: { activo: true },
    });

    const espacios: EspacioSolverData[] = espaciosRaw.map((e) => ({
      id: e.id,
      codigo: e.codigo,
      nombre: e.nombre,
      tipo: e.tipo,
      capacidad: e.capacidad,
      sedeId: e.sedeId,
      activa: e.activo,
    }));

    const input: SolverInput = {
      periodoId,
      seccionesPendientes,
      docentes: docentesMap,
      espacios,
      horariosExistentes,
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
    resultado: SolverResult
  ): Promise<{ aplicados: number }> {
    if (resultado.asignaciones.length === 0) {
      return { aplicados: 0 };
    }

    await prisma.$transaction(async (tx) => {
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
