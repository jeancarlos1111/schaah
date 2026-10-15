import { PrismaClient } from '@prisma/client';
import prismaDefault from '../../../core/database/prisma';
import { horasDocenciaSeccion } from '../../../core/domain/rules/dedicacionRules';
import { DedicacionInconsistente } from '../ofertaPlanificador';
import {
  ImportacionRegistrada,
  ReporteInconsistencias,
  analizarInconsistenciasOferta,
  generarLibroInconsistencias,
} from '../ofertaInconsistencias';

export class CodigoUnidadInvalidoError extends Error {}
export class UnidadFueraDeAlcanceError extends Error {}

/**
 * Alcance por programa (Spec 06): con `pfgIds` el reporte se limita a vacantes y códigos
 * provisionales de esos programas y a los docentes con asignaciones en ellos (con su carga total).
 */
export interface OpcionesAlcanceOferta {
  pfgIds?: string[];
}

function leerJson<T>(texto: string | null | undefined, porDefecto: T): T {
  try {
    return texto ? (JSON.parse(texto) as T) : porDefecto;
  } catch {
    return porDefecto;
  }
}

export class OfertaInconsistenciasService {
  constructor(private readonly prisma: PrismaClient = prismaDefault) {}

  async generarReporte(periodoId: string, opciones: OpcionesAlcanceOferta = {}): Promise<ReporteInconsistencias> {
    const { pfgIds } = opciones;
    const ucAlcance = pfgIds ? { unidadCurricular: { pfgId: { in: pfgIds } } } : {};
    const [profesores, vacantes, unidades, ultima] = await Promise.all([
      this.prisma.profesor.findMany({
        where: pfgIds
          ? { secciones: { some: { periodoId, ...ucAlcance } } }
          : { OR: [{ secciones: { some: { periodoId } } }, { dedicaciones: { some: { periodoId } } }] },
        include: {
          dedicaciones: { where: { periodoId }, select: { dedicacion: true } },
          secciones: {
            where: { periodoId },
            select: {
              codigoSeccion: true,
              horasSemanalesOferta: true,
              unidadCurricular: { select: { horasTeoricasSemanales: true, horasPracticasSemanales: true } },
            },
          },
        },
      }),
      this.prisma.seccion.findMany({
        where: { periodoId, profesorId: null, ...ucAlcance },
        include: {
          grupo: { select: { id: true, codigoNormalizado: true } },
          unidadCurricular: { include: { pfg: { select: { codigo: true } } } },
          sede: { select: { nombre: true } },
        },
      }),
      this.prisma.unidadCurricular.findMany({
        where: {
          codigoProvisional: true,
          secciones: { some: { periodoId } },
          ...(pfgIds ? { pfgId: { in: pfgIds } } : {}),
        },
        include: {
          pfg: { select: { codigo: true } },
          _count: { select: { secciones: { where: { periodoId } } } },
        },
      }),
      this.prisma.importacionOferta.findFirst({ where: { periodoId }, orderBy: { createdAt: 'desc' } }),
    ]);

    const cedulasVisibles = new Set(profesores.map((p) => p.cedula));
    const ultimaImportacion: ImportacionRegistrada | null = ultima
      ? {
          fecha: ultima.createdAt,
          nombreArchivo: ultima.nombreArchivo,
          usuarioNombre: ultima.usuarioNombre,
          dedicacionesInconsistentes: leerJson<DedicacionInconsistente[]>(ultima.dedicacionesInconsistentes, []).filter(
            (d) => !pfgIds || cedulasVisibles.has(d.cedula)
          ),
        }
      : null;

    return analizarInconsistenciasOferta({
      docentes: profesores.map((p) => ({
        id: p.id,
        cedula: p.cedula,
        nombres: p.nombres,
        apellidos: p.apellidos,
        dedicacion: p.dedicaciones[0]?.dedicacion ?? null,
        asignaciones: p.secciones,
      })),
      vacantes: vacantes.map((s) => ({
        id: s.id,
        codigoSeccion: s.codigoSeccion,
        grupoId: s.grupo?.id ?? null,
        grupoCodigo: s.grupo?.codigoNormalizado ?? null,
        pfgCodigo: s.unidadCurricular.pfg.codigo,
        ucCodigo: s.unidadCurricular.codigo,
        ucNombre: s.unidadCurricular.nombre,
        horas: horasDocenciaSeccion(s),
        sedeNombre: s.sede.nombre,
      })),
      unidadesProvisionales: unidades.map((u) => ({
        id: u.id,
        pfgCodigo: u.pfg.codigo,
        codigo: u.codigo,
        nombre: u.nombre,
        asignaciones: u._count.secciones,
      })),
      ultimaImportacion,
    });
  }

  async exportar(
    periodoId: string,
    generadoPor: string,
    opciones: OpcionesAlcanceOferta = {}
  ): Promise<{ nombreArchivo: string; contenido: Buffer }> {
    const periodo = await this.prisma.periodoAcademico.findUnique({ where: { id: periodoId } });
    if (!periodo) throw new Error('El período académico indicado no existe.');
    const reporte = await this.generarReporte(periodoId, opciones);
    const contenido = await generarLibroInconsistencias(reporte, {
      periodoCodigo: periodo.codigo,
      generadoPor,
      fecha: new Date(),
    });
    return { nombreArchivo: `INCONSISTENCIAS_OFERTA_${periodo.codigo}.xlsx`, contenido };
  }

  /**
   * Fija el código oficial de una UC importada con código provisional (RC-01: único dentro del PFG).
   * Las secciones conservan su código de asignación; las próximas importaciones reconocen la UC por nombre.
   */
  async confirmarCodigoUnidad(
    unidadId: string,
    codigo: string,
    opciones: OpcionesAlcanceOferta = {}
  ): Promise<{ anterior: string; nuevo: string }> {
    const nuevo = (codigo ?? '').trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9.\-_]{1,29}$/.test(nuevo)) {
      throw new CodigoUnidadInvalidoError('El código debe tener entre 2 y 30 caracteres: letras, números, punto, guion o guion bajo.');
    }
    const unidad = await this.prisma.unidadCurricular.findUnique({ where: { id: unidadId } });
    if (!unidad) throw new CodigoUnidadInvalidoError('La unidad curricular no existe.');
    if (opciones.pfgIds && !opciones.pfgIds.includes(unidad.pfgId)) {
      throw new UnidadFueraDeAlcanceError('La unidad curricular pertenece a un programa que usted no coordina.');
    }
    if (nuevo !== unidad.codigo) {
      const choque = await this.prisma.unidadCurricular.findFirst({
        where: { pfgId: unidad.pfgId, codigo: nuevo, NOT: { id: unidadId } },
      });
      if (choque) {
        throw new CodigoUnidadInvalidoError(`Violación RC-01: el código "${nuevo}" ya existe en este programa (${choque.nombre}).`);
      }
    }
    await this.prisma.unidadCurricular.update({
      where: { id: unidadId },
      data: { codigo: nuevo, codigoProvisional: false },
    });
    return { anterior: unidad.codigo, nuevo };
  }
}
