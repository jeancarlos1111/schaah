import prisma, { enableSqliteWal } from '../core/database/prisma';
import {
  DedicacionDocente,
  EscalafonDocente,
  CondicionLaboral,
  DiaSemana,
  TipoEspacio,
} from '../core/domain/enums';
import { LIMITES_DEDICACION } from '../core/domain/rules/dedicacionRules';

async function main() {
  console.log('[SEED-DOCENTES] Conectando a base de datos...');
  await enableSqliteWal();

  // 1. Asegurar Período Académico 2026-I
  const periodo = await prisma.periodoAcademico.upsert({
    where: { codigo: '2026-I' },
    update: {},
    create: {
      codigo: '2026-I',
      nombre: 'Período Académico 2026-I (Semestral)',
      fechaInicio: new Date('2026-02-02'),
      fechaFin: new Date('2026-07-24'),
      estado: 'ACTIVO',
    },
  });
  console.log(`[SEED-DOCENTES] Período asegurado: ${periodo.codigo} - ${periodo.nombre}`);

  // 2. Programas de Formación de Grado (PFG) de la UBV
  const pfgsData = [
    {
      codigo: 'PFG-INFO',
      nombre: 'Informática para la Gestión Social',
      areaConocimiento: 'Tecnología y Ciencias Aplicadas',
    },
    {
      codigo: 'PFG-AGRO',
      nombre: 'Agroecología',
      areaConocimiento: 'Ciencias del Agro y del Mar',
    },
    {
      codigo: 'PFG-GA',
      nombre: 'Gestión Ambiental',
      areaConocimiento: 'Ciencias Ecológicas y Desarrollo Sustentable',
    },
    {
      codigo: 'PFG-EJ',
      nombre: 'Estudios Jurídicos',
      areaConocimiento: 'Ciencias Sociales y Jurídicas',
    },
  ];

  const pfgsCreados: Record<string, string> = {};
  for (const pfg of pfgsData) {
    const res = await prisma.programaFormacion.upsert({
      where: { codigo: pfg.codigo },
      update: pfg,
      create: pfg,
    });
    pfgsCreados[pfg.codigo] = res.id;
  }
  console.log('[SEED-DOCENTES] Programas de Formación asegurados.');

  // 3. Unidades Curriculares Muestra
  const ucsData = [
    {
      pfgCodigo: 'PFG-INFO',
      codigo: 'INFO-101',
      nombre: 'Algorítmica y Programación I',
      trayecto: 1,
      tramo: 1,
      creditos: 4,
      horasTeoricasSemanales: 2,
      horasPracticasSemanales: 2,
      horasCampoComunitarioSemanales: 0,
      tipoEspacioRequerido: TipoEspacio.LABORATORIO_INFORMATICA,
      esProyectoComunitario: false,
    },
    {
      pfgCodigo: 'PFG-INFO',
      codigo: 'INFO-102',
      nombre: 'Redes y Telemática Libre',
      trayecto: 2,
      tramo: 1,
      creditos: 4,
      horasTeoricasSemanales: 2,
      horasPracticasSemanales: 2,
      horasCampoComunitarioSemanales: 0,
      tipoEspacioRequerido: TipoEspacio.LABORATORIO_INFORMATICA,
      esProyectoComunitario: false,
    },
    {
      pfgCodigo: 'PFG-INFO',
      codigo: 'INFO-PROY-1',
      nombre: 'Proyecto I: Desarrollo Comunitario de Software Libre',
      trayecto: 1,
      tramo: 2,
      creditos: 6,
      horasTeoricasSemanales: 2,
      horasPracticasSemanales: 0,
      horasCampoComunitarioSemanales: 4,
      tipoEspacioRequerido: TipoEspacio.ESPACIO_COMUNITARIO_CAMPO,
      esProyectoComunitario: true,
    },
    {
      pfgCodigo: 'PFG-AGRO',
      codigo: 'AGRO-201',
      nombre: 'Agroecología y Soberanía Alimentaria',
      trayecto: 2,
      tramo: 1,
      creditos: 4,
      horasTeoricasSemanales: 3,
      horasPracticasSemanales: 1,
      horasCampoComunitarioSemanales: 2,
      tipoEspacioRequerido: TipoEspacio.AULA_TEORICA,
      esProyectoComunitario: false,
    },
    {
      pfgCodigo: 'PFG-GA',
      codigo: 'GA-301',
      nombre: 'Evaluación de Impacto Ambiental en Cuencas Mineras',
      trayecto: 3,
      tramo: 1,
      creditos: 5,
      horasTeoricasSemanales: 3,
      horasPracticasSemanales: 2,
      horasCampoComunitarioSemanales: 3,
      tipoEspacioRequerido: TipoEspacio.AULA_TEORICA,
      esProyectoComunitario: false,
    },
    {
      pfgCodigo: 'PFG-EJ',
      codigo: 'EJ-101',
      nombre: 'Sociedad, Estado y Constitución',
      trayecto: 1,
      tramo: 1,
      creditos: 4,
      horasTeoricasSemanales: 4,
      horasPracticasSemanales: 0,
      horasCampoComunitarioSemanales: 0,
      tipoEspacioRequerido: TipoEspacio.AULA_TEORICA,
      esProyectoComunitario: false,
    },
  ];

  const ucsCreadas: Record<string, string> = {};
  for (const uc of ucsData) {
    const pfgId = pfgsCreados[uc.pfgCodigo];
    if (!pfgId) continue;

    const res = await prisma.unidadCurricular.upsert({
      where: {
        pfgId_codigo: {
          pfgId,
          codigo: uc.codigo,
        },
      },
      update: {
        nombre: uc.nombre,
        trayecto: uc.trayecto,
        tramo: uc.tramo,
        creditos: uc.creditos,
        horasTeoricasSemanales: uc.horasTeoricasSemanales,
        horasPracticasSemanales: uc.horasPracticasSemanales,
        horasCampoComunitarioSemanales: uc.horasCampoComunitarioSemanales,
        tipoEspacioRequerido: uc.tipoEspacioRequerido,
        esProyectoComunitario: uc.esProyectoComunitario,
      },
      create: {
        pfgId,
        codigo: uc.codigo,
        nombre: uc.nombre,
        trayecto: uc.trayecto,
        tramo: uc.tramo,
        creditos: uc.creditos,
        horasTeoricasSemanales: uc.horasTeoricasSemanales,
        horasPracticasSemanales: uc.horasPracticasSemanales,
        horasCampoComunitarioSemanales: uc.horasCampoComunitarioSemanales,
        tipoEspacioRequerido: uc.tipoEspacioRequerido,
        esProyectoComunitario: uc.esProyectoComunitario,
      },
    });
    ucsCreadas[uc.codigo] = res.id;
  }
  console.log('[SEED-DOCENTES] Unidades curriculares aseguradas.');

  // 4. Recuperar Sedes de Bolívar
  const sedes = await prisma.sede.findMany();
  const sedeMap = new Map(sedes.map((s) => [s.codigo, s.id]));

  const sedeBolivarId = sedeMap.get('SEDE_BOLIVAR_ANGOSTURA') || sedes[0]?.id;
  const sedeCaroniId = sedeMap.get('ALDEA_CARONI_PUERTO_ORDAZ') || sedes[0]?.id;
  const sedePiarId = sedeMap.get('ALDEA_PIAR_UPATA') || sedes[0]?.id;
  const sedeGranSabanaId = sedeMap.get('ALDEA_GRAN_SABANA') || sedes[0]?.id;

  // 5. Docentes UBV Estado Bolívar
  const docentesData = [
    {
      cedula: 'V-11894231',
      nombres: 'Carlos Alberto',
      apellidos: 'Gómez Salazar',
      email: 'cgomez@ubv.edu.ve',
      telefono: '0414-8521099',
      condicion: CondicionLaboral.ORDINARIO,
      escalafon: EscalafonDocente.ASOCIADO,
      dedicacion: DedicacionDocente.DEDICACION_EXCLUSIVA,
      sedeId: sedeBolivarId,
      secciones: ['INFO-101', 'INFO-102', 'INFO-PROY-1'], // 4h + 4h + 2h = 10h aula + 4h campo (Déficit leve de aula o en norma según interpretación)
    },
    {
      cedula: 'V-13456789',
      nombres: 'María Elena',
      apellidos: 'Rodríguez Piar',
      email: 'mrodriguez@ubv.edu.ve',
      telefono: '0424-9123456',
      condicion: CondicionLaboral.ORDINARIO,
      escalafon: EscalafonDocente.AGREGADO,
      dedicacion: DedicacionDocente.TIEMPO_COMPLETO,
      sedeId: sedeCaroniId,
      secciones: ['INFO-101', 'INFO-102', 'EJ-101'], // 4h + 4h + 4h = 12h (En norma tope)
    },
    {
      cedula: 'V-15789123',
      nombres: 'José Leonardo',
      apellidos: 'Bermúdez Yocoima',
      email: 'jbermudez@ubv.edu.ve',
      telefono: '0416-5896321',
      condicion: CondicionLaboral.CONTRATADO,
      escalafon: EscalafonDocente.ASISTENTE,
      dedicacion: DedicacionDocente.MEDIO_TIEMPO,
      sedeId: sedePiarId,
      secciones: ['AGRO-201'], // 4h (En norma mínimo)
    },
    {
      cedula: 'V-18456123',
      nombres: 'Tepuy Ana',
      apellidos: 'Akurimä Roraima',
      email: 'aakurima@ubv.edu.ve',
      telefono: '0426-3334455',
      condicion: CondicionLaboral.ORDINARIO,
      escalafon: EscalafonDocente.INSTRUCTOR,
      dedicacion: DedicacionDocente.TIEMPO_CONVENCIONAL,
      sedeId: sedeGranSabanaId,
      secciones: ['GA-301'], // 5h (En norma)
    },
    {
      cedula: 'V-09876543',
      nombres: 'Ramón Antonio',
      apellidos: 'Orinoco Vargas',
      email: 'rorinoco@ubv.edu.ve',
      telefono: '0412-8889900',
      condicion: CondicionLaboral.ORDINARIO,
      escalafon: EscalafonDocente.TITULAR,
      dedicacion: DedicacionDocente.DEDICACION_EXCLUSIVA,
      sedeId: sedeBolivarId,
      secciones: [], // Sin asignar (0h) -> Alerta
    },
  ];

  for (const d of docentesData) {
    const prof = await prisma.profesor.upsert({
      where: { cedula: d.cedula },
      update: {
        nombres: d.nombres,
        apellidos: d.apellidos,
        email: d.email,
        telefono: d.telefono,
        condicion: d.condicion,
        escalafon: d.escalafon,
        activo: true,
      },
      create: {
        cedula: d.cedula,
        nombres: d.nombres,
        apellidos: d.apellidos,
        email: d.email,
        telefono: d.telefono,
        condicion: d.condicion,
        escalafon: d.escalafon,
        activo: true,
      },
    });

    const limites = LIMITES_DEDICACION[d.dedicacion];

    await prisma.profesorDedicacion.upsert({
      where: {
        profesorId_periodoId: {
          profesorId: prof.id,
          periodoId: periodo.id,
        },
      },
      update: {
        dedicacion: d.dedicacion,
        horasPermanenciaSemanales: limites.maxPermanencia,
        minHorasDocenciaDirecta: limites.minDocencia,
        maxHorasDocenciaDirecta: limites.maxDocencia,
        sedeAdscripcionPrincipalId: d.sedeId,
      },
      create: {
        profesorId: prof.id,
        periodoId: periodo.id,
        dedicacion: d.dedicacion,
        horasPermanenciaSemanales: limites.maxPermanencia,
        minHorasDocenciaDirecta: limites.minDocencia,
        maxHorasDocenciaDirecta: limites.maxDocencia,
        sedeAdscripcionPrincipalId: d.sedeId,
      },
    });

    // Sembrar disponibilidad por defecto (Lunes a Viernes turnos matutino y vespertino)
    const franjasDefault = [
      { dia: DiaSemana.LUNES, horaInicio: '07:30', horaFin: '09:00', prioridad: 1 },
      { dia: DiaSemana.LUNES, horaInicio: '09:05', horaFin: '10:35', prioridad: 1 },
      { dia: DiaSemana.MARTES, horaInicio: '07:30', horaFin: '09:00', prioridad: 1 },
      { dia: DiaSemana.MARTES, horaInicio: '09:05', horaFin: '10:35', prioridad: 1 },
      { dia: DiaSemana.MIERCOLES, horaInicio: '12:30', horaFin: '14:00', prioridad: 2 },
      { dia: DiaSemana.MIERCOLES, horaInicio: '14:05', horaFin: '15:35', prioridad: 2 },
      { dia: DiaSemana.JUEVES, horaInicio: '07:30', horaFin: '09:00', prioridad: 1 },
      { dia: DiaSemana.VIERNES, horaInicio: '09:05', horaFin: '10:35', prioridad: 3 },
    ];

    await prisma.profesorDisponibilidad.deleteMany({
      where: { profesorId: prof.id, periodoId: periodo.id },
    });

    await prisma.profesorDisponibilidad.createMany({
      data: franjasDefault.map((f) => ({
        profesorId: prof.id,
        periodoId: periodo.id,
        dia: f.dia,
        horaInicio: f.horaInicio,
        horaFin: f.horaFin,
        prioridadPreferencia: f.prioridad,
        disponible: true,
      })),
    });

    // Sembrar Secciones asignadas
    let indexSecc = 1;
    for (const ucCodigo of d.secciones) {
      const ucId = ucsCreadas[ucCodigo];
      if (!ucId) continue;

      const codigoSec = `SEC-${d.cedula.slice(-4)}-${ucCodigo}-${indexSecc}`;
      await prisma.seccion.upsert({
        where: {
          periodoId_codigoSeccion: {
            periodoId: periodo.id,
            codigoSeccion: codigoSec,
          },
        },
        update: {
          unidadCurricularId: ucId,
          sedeId: d.sedeId,
          profesorId: prof.id,
          turno: 'MATUTINO',
          cuposEstimados: 30,
        },
        create: {
          periodoId: periodo.id,
          unidadCurricularId: ucId,
          sedeId: d.sedeId,
          profesorId: prof.id,
          codigoSeccion: codigoSec,
          turno: 'MATUTINO',
          cuposEstimados: 30,
        },
      });
      indexSecc++;
    }

    console.log(`[SEED-DOCENTES] Docente procesado: ${prof.apellidos}, ${prof.nombres} (${d.dedicacion})`);
  }

  console.log('[SEED-DOCENTES] Siembra de Planta Docente y Dedicaciones culminada con éxito.');
}

main()
  .catch((e) => {
    console.error('[SEED-DOCENTES] Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
