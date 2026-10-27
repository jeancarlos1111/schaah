import { PrismaClient } from '@prisma/client';
import { existsSync, unlinkSync } from 'fs';
import path from 'path';
import { DedicacionDocente } from '../domain/enums';
import { LIMITES_DEDICACION } from '../domain/rules/dedicacionRules';
import { BLOQUES_HORARIOS_OFICIALES, DIAS_LECTIVOS, indicesBloquesPorTurno } from '../domain/rules/timeSlotUtils';

/** Base SQLite de demostración para las capturas del manual de usuario (ignorada por git). */
export const RUTA_BASE_DEMO = path.resolve(__dirname, '../../../prisma/demo-manual.db');

export class DestinoDemoInvalidoError extends Error {}

/** Holgura de aulas teóricas sobre el mínimo teórico, para que el solver encuentre solución. */
const HOLGURA_AULAS = 1.5;
const CAPACIDAD_AULA_DEMO = 45;

/** Ruta absoluta de una URL `file:` de Prisma; las relativas se resuelven desde `prisma/`, como hace Prisma. */
export function rutaSqlite(url: string): string {
  if (!url.startsWith('file:')) {
    throw new DestinoDemoInvalidoError('La base de demostración debe ser SQLite (DATABASE_URL="file:...").');
  }
  const ruta = url.slice('file:'.length).split('?')[0];
  return path.isAbsolute(ruta) ? ruta : path.resolve(__dirname, '../../../prisma', ruta);
}

/**
 * La siembra de demostración escribe datos ficticios: nunca debe apuntar a la base de trabajo
 * (`dev.db`) ni a la base de origen de la copia.
 */
export function verificarDestinoDemo(urlDestino: string, urlOrigen?: string): string {
  const destino = rutaSqlite(urlDestino);
  if (path.basename(destino) === 'dev.db') {
    throw new DestinoDemoInvalidoError(`Destino rechazado: ${destino} es la base de trabajo (dev.db).`);
  }
  if (urlOrigen && rutaSqlite(urlOrigen) === destino) {
    throw new DestinoDemoInvalidoError(`Destino rechazado: ${destino} es la misma base de origen.`);
  }
  return destino;
}

/** Copia consistente (VACUUM INTO) de la base de origen hacia el destino de demostración. */
export async function copiarBaseDemo(origen: PrismaClient, destino: string): Promise<void> {
  for (const sufijo of ['', '-wal', '-shm', '-journal']) {
    if (existsSync(destino + sufijo)) unlinkSync(destino + sufijo);
  }
  await origen.$executeRawUnsafe(`VACUUM INTO '${destino.replace(/'/g, "''")}'`);
}

export interface OpcionesDemoManual {
  periodoCodigo?: string;
  pfgCodigo?: string;
  emailDocente?: string;
}

export interface ResumenDemoManual {
  periodoId: string;
  seccionesPfg: number;
  docentesConDisponibilidad: number;
  franjasCreadas: number;
  aulasAgregadas: number;
  seccionDocente: string | null;
}

/**
 * Declara disponibilidad (lunes a sábado, bloques de los turnos de sus secciones) para todos
 * los docentes con asignación en el período. Útil tras una corrida infactible del solver
 * para volver a optimizar con factibilidad.
 */
export async function sembrarDisponibilidadPeriodo(
  prisma: PrismaClient,
  periodoId: string
): Promise<number> {
  const secciones = await prisma.seccion.findMany({
    where: { periodoId, profesorId: { not: null } },
    select: { profesorId: true, turno: true },
  });
  const turnosPorDocente = new Map<string, Set<string>>();
  for (const s of secciones) {
    if (!s.profesorId) continue;
    const turnos = turnosPorDocente.get(s.profesorId) ?? new Set<string>();
    turnos.add(s.turno);
    turnosPorDocente.set(s.profesorId, turnos);
  }
  let franjas = 0;
  for (const [profesorId, turnos] of turnosPorDocente) {
    const indices = new Set<number>();
    for (const turno of turnos) indicesBloquesPorTurno(turno).forEach((i) => indices.add(i));
    const data = DIAS_LECTIVOS.flatMap((dia) =>
      [...indices].sort((a, b) => a - b).map((i) => ({
        profesorId,
        periodoId,
        dia,
        horaInicio: BLOQUES_HORARIOS_OFICIALES[i].horaInicio,
        horaFin: BLOQUES_HORARIOS_OFICIALES[i].horaFin,
        prioridadPreferencia: 1,
        disponible: true,
      }))
    );
    await prisma.profesorDisponibilidad.deleteMany({ where: { profesorId, periodoId } });
    await prisma.profesorDisponibilidad.createMany({ data });
    franjas += data.length;
  }
  return franjas;
}

/**
 * Datos de demostración sobre una copia de la base: el docente de prueba recibe una sección
 * vacante del programa y una dedicación, todos los docentes del programa declaran
 * disponibilidad de lunes a sábado en los bloques de los turnos de sus secciones y la sede
 * recibe las aulas teóricas que le falten. Los demás programas quedan sin disponibilidad.
 */
export async function sembrarDemoManual(
  prisma: PrismaClient,
  opciones: OpcionesDemoManual = {}
): Promise<ResumenDemoManual> {
  const periodoCodigo = opciones.periodoCodigo ?? '2026-II';
  const pfgCodigo = opciones.pfgCodigo ?? 'PFG-INFO';
  const emailDocente = opciones.emailDocente ?? 'carlos.gomez@ubv.edu.ve';

  const periodo = await prisma.periodoAcademico.findUniqueOrThrow({ where: { codigo: periodoCodigo } });
  const pfg = await prisma.programaFormacion.findUniqueOrThrow({ where: { codigo: pfgCodigo } });
  const filtroSecciones = { periodoId: periodo.id, unidadCurricular: { pfgId: pfg.id } };

  let seccionDocente: string | null = null;
  const usuarioDocente = await prisma.usuario.findUnique({ where: { email: emailDocente } });
  if (usuarioDocente?.profesorId) {
    const vacante = await prisma.seccion.findFirst({
      where: { ...filtroSecciones, profesorId: null },
      orderBy: { codigoSeccion: 'asc' },
    });
    if (vacante) {
      await prisma.seccion.update({ where: { id: vacante.id }, data: { profesorId: usuarioDocente.profesorId } });
      seccionDocente = vacante.codigoSeccion;
      const limites = LIMITES_DEDICACION[DedicacionDocente.TIEMPO_COMPLETO];
      await prisma.profesorDedicacion.upsert({
        where: { profesorId_periodoId: { profesorId: usuarioDocente.profesorId, periodoId: periodo.id } },
        update: {},
        create: {
          profesorId: usuarioDocente.profesorId,
          periodoId: periodo.id,
          dedicacion: DedicacionDocente.TIEMPO_COMPLETO,
          horasPermanenciaSemanales: limites.maxPermanencia,
          minHorasDocenciaDirecta: limites.minDocencia,
          maxHorasDocenciaDirecta: limites.maxDocencia,
          sedeAdscripcionPrincipalId: vacante.sedeId,
        },
      });
    }
  }

  const secciones = await prisma.seccion.findMany({
    where: filtroSecciones,
    select: { profesorId: true, turno: true, sedeId: true, horasSemanalesOferta: true, unidadCurricular: true },
  });
  const turnosPorDocente = new Map<string, Set<string>>();
  for (const s of secciones) {
    if (!s.profesorId) continue;
    const turnos = turnosPorDocente.get(s.profesorId) ?? new Set<string>();
    turnos.add(s.turno);
    turnosPorDocente.set(s.profesorId, turnos);
  }

  const aulasAgregadas = await completarAulasTeoricas(prisma, secciones);

  let franjasCreadas = 0;
  for (const [profesorId, turnos] of turnosPorDocente) {
    const indices = new Set<number>();
    for (const turno of turnos) indicesBloquesPorTurno(turno).forEach((i) => indices.add(i));
    const franjas = DIAS_LECTIVOS.flatMap((dia) =>
      [...indices].sort((a, b) => a - b).map((i) => ({
        profesorId,
        periodoId: periodo.id,
        dia,
        horaInicio: BLOQUES_HORARIOS_OFICIALES[i].horaInicio,
        horaFin: BLOQUES_HORARIOS_OFICIALES[i].horaFin,
        prioridadPreferencia: 1,
        disponible: true,
      }))
    );
    await prisma.profesorDisponibilidad.deleteMany({ where: { profesorId, periodoId: periodo.id } });
    await prisma.profesorDisponibilidad.createMany({ data: franjas });
    franjasCreadas += franjas.length;
  }

  // Adscripción al PFG de demostración (visible en nómina y pills). Los 3 días y el piso del
  // docente de prueba se fijan en capturasManual tras el solver, para no volverlo infactible.
  for (const profesorId of turnosPorDocente.keys()) {
    await prisma.profesor.update({
      where: { id: profesorId },
      data: { pfgAdscripcionId: pfg.id },
    });
  }

  return {
    periodoId: periodo.id,
    seccionesPfg: secciones.length,
    docentesConDisponibilidad: turnosPorDocente.size,
    franjasCreadas,
    aulasAgregadas,
    seccionDocente,
  };
}

interface SeccionDemanda {
  turno: string;
  sedeId: string;
  horasSemanalesOferta: number | null;
  unidadCurricular: {
    horasTeoricasSemanales: number;
    horasPracticasSemanales: number;
    horasCampoComunitarioSemanales: number;
    tipoEspacioRequerido: string;
    esProyectoComunitario: boolean;
  };
}

/** Bloques de 90 min que pide una sección, con el mismo redondeo que el solver. */
function bloquesDeSeccion(s: SeccionDemanda): number {
  const uc = s.unidadCurricular;
  const horas =
    s.horasSemanalesOferta && s.horasSemanalesOferta > 0
      ? s.horasSemanalesOferta
      : uc.horasTeoricasSemanales + uc.horasPracticasSemanales + uc.horasCampoComunitarioSemanales;
  return Math.max(1, Math.round(horas / 2));
}

/**
 * Agrega aulas teóricas de demostración a cada sede hasta cubrir, con holgura, el turno más
 * demandado: las franjas de un turno en la semana son sus bloques diarios por los días lectivos.
 */
async function completarAulasTeoricas(prisma: PrismaClient, secciones: SeccionDemanda[]): Promise<number> {
  const demanda = new Map<string, Map<string, number>>();
  for (const s of secciones) {
    if (s.unidadCurricular.esProyectoComunitario || s.unidadCurricular.tipoEspacioRequerido !== 'AULA_TEORICA') continue;
    const porTurno = demanda.get(s.sedeId) ?? new Map<string, number>();
    porTurno.set(s.turno, (porTurno.get(s.turno) ?? 0) + bloquesDeSeccion(s));
    demanda.set(s.sedeId, porTurno);
  }

  let agregadas = 0;
  for (const [sedeId, porTurno] of demanda) {
    const necesarias = Math.max(
      ...[...porTurno].map(([turno, bloques]) =>
        Math.ceil((bloques / (indicesBloquesPorTurno(turno).length * DIAS_LECTIVOS.length)) * HOLGURA_AULAS)
      )
    );
    const existentes = await prisma.espacioFisico.count({ where: { sedeId, tipo: 'AULA_TEORICA', activo: true } });
    for (let n = 1; n <= necesarias - existentes; n++) {
      await prisma.espacioFisico.create({
        data: {
          sedeId,
          codigo: `AUL-DEMO-${String(n).padStart(2, '0')}`,
          nombre: `Aula de demostración ${n}`,
          tipo: 'AULA_TEORICA',
          capacidad: CAPACIDAD_AULA_DEMO,
          piso: 'PB',
          pisoNivel: 0,
        },
      });
      agregadas++;
    }
  }
  return agregadas;
}
