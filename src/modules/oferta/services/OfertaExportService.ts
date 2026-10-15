import { PrismaClient } from '@prisma/client';
import prismaDefault from '../../../core/database/prisma';
import { MetadatosOferta, generarLibroOferta } from '../ofertaExcel';
import { SeccionExportable, construirFilasOferta } from '../ofertaExportador';

function fechaCorta(fecha: Date): string {
  const dd = String(fecha.getDate()).padStart(2, '0');
  const mm = String(fecha.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${fecha.getFullYear()}`;
}

export function metadatosExportacion(periodoCodigo: string, elaboradoPor: string, fecha: Date): MetadatosOferta {
  return {
    titulo: `OFERTA DE CARGA HORARIA ${periodoCodigo}`,
    lineas: [
      `FECHA DE ENTREGA: ${fechaCorta(fecha)}`,
      `ELABORADO POR: ${elaboradoPor.toUpperCase()}`,
      'REVISADO: SAHAD UBV',
      `FECHA ACTUALIZACIÓN: ${fechaCorta(fecha)}`,
    ],
  };
}

export class OfertaExportService {
  constructor(private readonly prisma: PrismaClient = prismaDefault) {}

  /** `pfgIds` limita la exportación a esos programas (alcance del coordinador, Spec 06). */
  async seccionesExportables(periodoId: string, pfgIds?: string[]): Promise<SeccionExportable[]> {
    return this.prisma.seccion.findMany({
      where: { periodoId, ...(pfgIds ? { unidadCurricular: { pfgId: { in: pfgIds } } } : {}) },
      select: {
        codigoSeccion: true,
        turno: true,
        cuposEstimados: true,
        horasSemanalesOferta: true,
        aulaEspecializada: true,
        observaciones: true,
        sede: { select: { codigo: true, nombre: true, ejeMunicipal: true } },
        unidadCurricular: {
          select: {
            codigo: true,
            nombre: true,
            trayecto: true,
            tramo: true,
            horasTeoricasSemanales: true,
            horasPracticasSemanales: true,
            pfg: { select: { codigo: true } },
          },
        },
        grupo: {
          select: {
            codigo: true,
            codigoNormalizado: true,
            trayecto: true,
            tramo: true,
            malla: true,
            turno: true,
            estatus: true,
            cantidadEstudiantes: true,
            seccionesAsesoria: true,
            nroEncuentros: true,
            ejeMunicipal: true,
          },
        },
        profesor: {
          select: {
            cedula: true,
            nombres: true,
            apellidos: true,
            condicion: true,
            escalafon: true,
            profesion: true,
            estudiosCuartoNivel: true,
            anioIngreso: true,
            anioConcurso: true,
            centroEstudio: { select: { codigo: true } },
            dedicaciones: { where: { periodoId }, select: { dedicacion: true } },
          },
        },
      },
    });
  }

  async exportar(
    periodoId: string,
    elaboradoPor: string,
    pfgIds?: string[]
  ): Promise<{ nombreArchivo: string; contenido: Buffer }> {
    const periodo = await this.prisma.periodoAcademico.findUnique({ where: { id: periodoId } });
    if (!periodo) throw new Error('El período académico indicado no existe.');

    const filas = construirFilasOferta(await this.seccionesExportables(periodoId, pfgIds));
    const meta = metadatosExportacion(periodo.codigo, elaboradoPor, new Date());
    const contenido = await generarLibroOferta(meta, filas, `OFERTA ${periodo.codigo}`);
    return { nombreArchivo: `OFERTA_CARGA_HORARIA_${periodo.codigo}.xlsx`, contenido };
  }
}
