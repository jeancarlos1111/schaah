import { PrismaClient } from '@prisma/client';
import { RolUsuario, Turno } from '../../src/core/domain/enums';
import { UsuarioSesion } from './peticiones';

/** Constructores de datos de prueba sobre la base efímera (sin atajos: registros reales de Prisma). */
export function fabrica(prisma: PrismaClient) {
  let consecutivoCedula = 10_000_000;

  return {
    unidad(
      pfgId: string,
      codigo: string,
      nombre: string,
      datos: Partial<{
        trayecto: number | null;
        tramo: number | null;
        horasTeoricas: number;
        horasPracticas: number;
        esProyectoComunitario: boolean;
        codigoProvisional: boolean;
      }> = {}
    ) {
      return prisma.unidadCurricular.create({
        data: {
          pfgId,
          codigo,
          nombre,
          trayecto: datos.trayecto === undefined ? 1 : datos.trayecto,
          tramo: datos.tramo === undefined ? 1 : datos.tramo,
          creditos: 3,
          horasTeoricasSemanales: datos.horasTeoricas ?? 2,
          horasPracticasSemanales: datos.horasPracticas ?? 2,
          esProyectoComunitario: datos.esProyectoComunitario ?? false,
          tipoEspacioRequerido: datos.esProyectoComunitario ? 'ESPACIO_COMUNITARIO_CAMPO' : 'AULA_TEORICA',
          codigoProvisional: datos.codigoProvisional ?? false,
        },
      });
    },

    seccion(datos: {
      periodoId: string;
      unidadId: string;
      sedeId: string;
      codigo: string;
      profesorId?: string | null;
      grupoId?: string | null;
      horas?: number;
      cupos?: number;
    }) {
      return prisma.seccion.create({
        data: {
          periodoId: datos.periodoId,
          unidadCurricularId: datos.unidadId,
          sedeId: datos.sedeId,
          codigoSeccion: datos.codigo,
          profesorId: datos.profesorId ?? null,
          grupoId: datos.grupoId ?? null,
          turno: Turno.MATUTINO,
          cuposEstimados: datos.cupos ?? 30,
          horasSemanalesOferta: datos.horas ?? null,
        },
      });
    },

    profesor(nombreCompleto: string) {
      const [nombres, ...apellidos] = nombreCompleto.split(' ');
      consecutivoCedula += 1;
      return prisma.profesor.create({
        data: { cedula: `V-${consecutivoCedula}`, nombres, apellidos: apellidos.join(' ') || 'UBV' },
      });
    },

    aula(sedeId: string, nombre: string, capacidad: number, codigo = nombre.replace(/\W+/g, '-').toUpperCase()) {
      return prisma.espacioFisico.create({ data: { sedeId, codigo, nombre, capacidad, tipo: 'AULA_TEORICA' } });
    },

    async usuario(email: string, rol: RolUsuario, pfgIds: string[] = []): Promise<UsuarioSesion> {
      const [nombres, apellidos = 'UBV'] = email.split('@')[0].split('.');
      const u = await prisma.usuario.create({
        data: {
          email,
          passwordHash: 'sin-uso-en-pruebas',
          nombres,
          apellidos,
          rol,
          programas: { create: pfgIds.map((pfgId) => ({ pfgId })) },
        },
      });
      return { id: u.id, email: u.email, nombres: u.nombres, apellidos: u.apellidos, rol };
    },
  };
}
