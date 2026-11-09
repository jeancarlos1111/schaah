import prisma, { enableSqliteWal } from '../core/database/prisma';
import { TipoEspacio } from '../core/domain/enums';
import { normalizarNivelPiso } from '../core/domain/rules/pisoRules';

export interface EspacioSeedItem {
  sedeCodigo: string;
  codigo: string;
  nombre: string;
  tipo: TipoEspacio;
  capacidad: number;
  piso: string;
  pisoNivel: number;
}

const AULAS_PISO_1 = ['1-4', '1-5', '1-7', '1-8', '1-11', '1-12', '1-13'];
const AULAS_PISO_2 = [
  '2-1',
  '2-2',
  '2-3',
  '2-4',
  '2-5',
  '2-6',
  '2-7',
  '2-8',
  '2-9',
  '2-10',
  '2-11',
  '2-12',
  '2-13',
  '2-14',
  '2-15',
  '2-16',
  '2-18',
];
const AULAS_PISO_3 = [
  '3-18',
  '3-19',
  '3-21',
  '3-23',
  '3-25',
  '3-28',
  '3-29',
  '3-30',
  '3-31',
  '3-32',
  '3-33',
  '3-34',
  '3-35',
  '3-36',
];

export const ESPACIOS_NATURALES_SEDE_BOLIVAR: EspacioSeedItem[] = [
  // Aulas 1er. Piso
  ...AULAS_PISO_1.map((num) => ({
    sedeCodigo: 'SEDE_BOLIVAR_ANGOSTURA',
    codigo: `AULA-${num}`,
    nombre: `Aula ${num}`,
    tipo: TipoEspacio.AULA_TEORICA,
    capacidad: 40,
    piso: 'Piso 1',
    pisoNivel: 1,
  })),
  // Aulas 2do. Piso
  ...AULAS_PISO_2.map((num) => ({
    sedeCodigo: 'SEDE_BOLIVAR_ANGOSTURA',
    codigo: `AULA-${num}`,
    nombre: `Aula ${num}`,
    tipo: TipoEspacio.AULA_TEORICA,
    capacidad: 40,
    piso: 'Piso 2',
    pisoNivel: 2,
  })),
  // Aulas 3er. Piso
  ...AULAS_PISO_3.map((num) => ({
    sedeCodigo: 'SEDE_BOLIVAR_ANGOSTURA',
    codigo: `AULA-${num}`,
    nombre: `Aula ${num}`,
    tipo: TipoEspacio.AULA_TEORICA,
    capacidad: 40,
    piso: 'Piso 3',
    pisoNivel: 3,
  })),
  // Arquitectura: Dos aulas taller
  {
    sedeCodigo: 'SEDE_BOLIVAR_ANGOSTURA',
    codigo: 'TALLER-ARQ-1',
    nombre: 'Taller Arquitectura 1',
    tipo: TipoEspacio.TALLER,
    capacidad: 35,
    piso: 'Piso 1',
    pisoNivel: 1,
  },
  {
    sedeCodigo: 'SEDE_BOLIVAR_ANGOSTURA',
    codigo: 'TALLER-ARQ-2',
    nombre: 'Taller Arquitectura 2',
    tipo: TipoEspacio.TALLER,
    capacidad: 35,
    piso: 'Piso 1',
    pisoNivel: 1,
  },
  // Informática: Laboratorios
  {
    sedeCodigo: 'SEDE_BOLIVAR_ANGOSTURA',
    codigo: 'LAB-2',
    nombre: 'Laboratorio #2',
    tipo: TipoEspacio.LABORATORIO_INFORMATICA,
    capacidad: 28,
    piso: 'Piso 1',
    pisoNivel: 1,
  },
  {
    sedeCodigo: 'SEDE_BOLIVAR_ANGOSTURA',
    codigo: 'LAB-11',
    nombre: 'Laboratorio #11',
    tipo: TipoEspacio.LABORATORIO_INFORMATICA,
    capacidad: 28,
    piso: 'Piso 1',
    pisoNivel: 1,
  },
  {
    sedeCodigo: 'SEDE_BOLIVAR_ANGOSTURA',
    codigo: 'LAB-12',
    nombre: 'Laboratorio #12',
    tipo: TipoEspacio.LABORATORIO_INFORMATICA,
    capacidad: 28,
    piso: 'Piso 1',
    pisoNivel: 1,
  },
];

async function main() {
  console.log('[SEED-ESPACIOS] Conectando a base de datos...');
  await enableSqliteWal();

  // Limpiar espacios y sedes anteriores de prueba si no tienen dependencias
  const dependenciasSecciones = await prisma.seccion.count();
  const dependenciasDedicaciones = await prisma.profesorDedicacion.count();

  if (dependenciasSecciones === 0 && dependenciasDedicaciones === 0) {
    console.log('[SEED-ESPACIOS] Purgando sedes y espacios previos de prueba...');
    await prisma.espacioFisico.deleteMany({});
    await prisma.sede.deleteMany({});
  }

  // 1. Sedes y Aldeas Municipalizadas de la UBV en el Estado Bolívar
  // Eje Geopolítico Territorial Kerepakupai Vena (Bolívar - Amazonas)
  const sedesData = [
    {
      codigo: 'SEDE_BOLIVAR_ANGOSTURA',
      nombre: 'Sede UBV Bolívar - Ciudad Bolívar',
      ejeTerritorial: 'Eje Geopolítico Territorial Kerepakupai Vena',
      direccion: 'Av. Germania con Calle Igualdad, Ciudad Bolívar, Mcpio. Angostura del Orinoco',
      ejeMunicipal: 'RÍO CAURA',
      esAldeaMunicipalizada: false,
      activa: true,
    },
    {
      codigo: 'ALDEA_CARONI_PUERTO_ORDAZ',
      nombre: 'Aldea Universitaria Caroní (Puerto Ordaz)',
      ejeTerritorial: 'Eje Geopolítico Territorial Kerepakupai Vena',
      direccion: 'Sector Alta Vista / Unare, Puerto Ordaz, Mcpio. Caroní',
      ejeMunicipal: 'RÍO CARONÍ',
      esAldeaMunicipalizada: true,
      activa: true,
    },
    {
      codigo: 'ALDEA_CVG_GOSH',
      nombre: 'Aldea Universitaria CVG-GOSH (Puerto Ordaz)',
      ejeTerritorial: 'Eje Geopolítico Territorial Kerepakupai Vena',
      direccion: 'Instalaciones CVG-GOSH, Puerto Ordaz, Mcpio. Caroní',
      ejeMunicipal: 'RÍO CARONÍ',
      esAldeaMunicipalizada: true,
      activa: true,
    },
    {
      codigo: 'ALDEA_PIAR_UPATA',
      nombre: 'Aldea Universitaria Upata',
      ejeTerritorial: 'Eje Geopolítico Territorial Kerepakupai Vena',
      direccion: 'Av. Valmore Rodríguez, Upata, Mcpio. Piar',
      ejeMunicipal: 'SIERRA IMATACA',
      esAldeaMunicipalizada: true,
      activa: true,
    },
    {
      codigo: 'ALDEA_CEDENO_CAICARA',
      nombre: 'Aldea Universitaria Caicara del Orinoco',
      ejeTerritorial: 'Eje Geopolítico Territorial Kerepakupai Vena',
      direccion: 'Av. Carabobo, Caicara del Orinoco, Mcpio. General Manuel Cedeño',
      ejeMunicipal: 'FAJA DEL ORINOCO',
      esAldeaMunicipalizada: true,
      activa: true,
    },
    {
      codigo: 'ALDEA_GRAN_SABANA',
      nombre: 'Aldea Universitaria Santa Elena de Uairén',
      ejeTerritorial: 'Eje Geopolítico Territorial Kerepakupai Vena',
      direccion: 'Sector Akurimä, Santa Elena de Uairén, Mcpio. Gran Sabana',
      ejeMunicipal: 'INDIO PEMÓN',
      esAldeaMunicipalizada: true,
      activa: true,
    },
    {
      codigo: 'ALDEA_ROSCIO_GUASIPATI',
      nombre: 'Aldea Universitaria Guasipati',
      ejeTerritorial: 'Eje Geopolítico Territorial Kerepakupai Vena',
      direccion: 'Calle Bolívar, Casco Central, Guasipati, Mcpio. Roscio',
      ejeMunicipal: 'SIERRA IMATACA',
      esAldeaMunicipalizada: true,
      activa: true,
    },
    {
      codigo: 'ALDEA_BOLIVARIANO_ANGOSTURA',
      nombre: 'Aldea Universitaria Ciudad Piar',
      ejeTerritorial: 'Eje Geopolítico Territorial Kerepakupai Vena',
      direccion: 'Sector La Paragua / Ciudad Piar, Mcpio. Bolivariano Angostura',
      ejeMunicipal: 'RÍO CAURA',
      esAldeaMunicipalizada: true,
      activa: true,
    },
  ];

  const sedesCreadas: Record<string, string> = {};

  for (const s of sedesData) {
    const sede = await prisma.sede.upsert({
      where: { codigo: s.codigo },
      update: s,
      create: s,
    });
    sedesCreadas[s.codigo] = sede.id;
    console.log(`[SEED-ESPACIOS] Sede asegurada: ${s.nombre} (${s.esAldeaMunicipalizada ? 'Aldea Municipalizada' : 'Sede Principal'})`);
  }

  // Purgar espacios anteriores obsoletos de la Sede UBV Bolívar que no estén en el catálogo oficial ni tengan horarios asignados
  const sedeBolivarId = sedesCreadas['SEDE_BOLIVAR_ANGOSTURA'];
  if (sedeBolivarId) {
    const codigosOficialesBolivar = ESPACIOS_NATURALES_SEDE_BOLIVAR.map((e) => e.codigo);
    await prisma.espacioFisico.deleteMany({
      where: {
        sedeId: sedeBolivarId,
        codigo: { notIn: codigosOficialesBolivar },
        horarios: { none: {} },
      },
    });
  }

  // 2. Aulas, Talleres, Laboratorios y Espacios de Campo en Estado Bolívar
  const espaciosData: EspacioSeedItem[] = [
    // ------------------------------------------------------------------------
    // Sede Principal UBV Bolívar (Municipio Angostura del Orinoco)
    // ------------------------------------------------------------------------
    ...ESPACIOS_NATURALES_SEDE_BOLIVAR,

    // ------------------------------------------------------------------------
    // Aldea Universitaria Caroní (Puerto Ordaz / San Félix - Municipio Caroní)
    // ------------------------------------------------------------------------
    {
      sedeCodigo: 'ALDEA_CARONI_PUERTO_ORDAZ',
      codigo: 'ALD-CAR-01',
      nombre: 'Aula Simón Bolívar - Caroní',
      tipo: TipoEspacio.AULA_TEORICA,
      capacidad: 35,
      piso: 'Piso 1',
      pisoNivel: 1,
    },
    {
      sedeCodigo: 'ALDEA_CARONI_PUERTO_ORDAZ',
      codigo: 'ALD-CAR-02',
      nombre: 'Aula Cacique Caroní',
      tipo: TipoEspacio.AULA_TEORICA,
      capacidad: 30,
      piso: 'Piso 1',
      pisoNivel: 1,
    },
    {
      sedeCodigo: 'ALDEA_CARONI_PUERTO_ORDAZ',
      codigo: 'ALD-CAR-LAB',
      nombre: 'Laboratorio de Sistemas e Informática Caroní',
      tipo: TipoEspacio.LABORATORIO_INFORMATICA,
      capacidad: 25,
      piso: 'Planta Baja',
      pisoNivel: 0,
    },
    {
      sedeCodigo: 'ALDEA_CARONI_PUERTO_ORDAZ',
      codigo: 'CAMPO-COMUNA-CARONI',
      nombre: 'Comuna Socioproductiva San Félix (Comunidad/Campo)',
      tipo: TipoEspacio.ESPACIO_COMUNITARIO_CAMPO,
      capacidad: 40,
      piso: 'Territorial',
      pisoNivel: 0,
    },

    // ------------------------------------------------------------------------
    // Aldea Universitaria CVG-GOSH (Puerto Ordaz - Municipio Caroní)
    // ------------------------------------------------------------------------
    {
      sedeCodigo: 'ALDEA_CVG_GOSH',
      codigo: 'GOSH-01',
      nombre: 'Aula CVG-GOSH 01',
      tipo: TipoEspacio.AULA_TEORICA,
      capacidad: 40,
      piso: 'Planta Baja',
      pisoNivel: 0,
    },
    {
      sedeCodigo: 'ALDEA_CVG_GOSH',
      codigo: 'GOSH-02',
      nombre: 'Aula CVG-GOSH 02',
      tipo: TipoEspacio.AULA_TEORICA,
      capacidad: 40,
      piso: 'Planta Baja',
      pisoNivel: 0,
    },
    {
      sedeCodigo: 'ALDEA_CVG_GOSH',
      codigo: 'GOSH-LAB',
      nombre: 'Taller de Computación CVG-GOSH',
      tipo: TipoEspacio.LABORATORIO_INFORMATICA,
      capacidad: 25,
      piso: 'Planta Baja',
      pisoNivel: 0,
    },

    // ------------------------------------------------------------------------
    // Aldea Universitaria Piar (Upata - Municipio Piar)
    // ------------------------------------------------------------------------
    {
      sedeCodigo: 'ALDEA_PIAR_UPATA',
      codigo: 'ALD-PIA-01',
      nombre: 'Aula Yocoima 01',
      tipo: TipoEspacio.AULA_TEORICA,
      capacidad: 30,
      piso: 'Planta Baja',
      pisoNivel: 0,
    },
    {
      sedeCodigo: 'ALDEA_PIAR_UPATA',
      codigo: 'ALD-PIA-02',
      nombre: 'Aula Manuel Piar 02',
      tipo: TipoEspacio.AULA_TEORICA,
      capacidad: 28,
      piso: 'Planta Baja',
      pisoNivel: 0,
    },
    {
      sedeCodigo: 'ALDEA_PIAR_UPATA',
      codigo: 'ALD-PIA-LAB',
      nombre: 'Laboratorio Comunitario Upata',
      tipo: TipoEspacio.LABORATORIO_INFORMATICA,
      capacidad: 20,
      piso: 'Planta Baja',
      pisoNivel: 0,
    },
    {
      sedeCodigo: 'ALDEA_PIAR_UPATA',
      codigo: 'CAMPO-VALLE-YOCOIMA',
      nombre: 'Eje Productivo Agroecológico Valle del Yocoima',
      tipo: TipoEspacio.ESPACIO_COMUNITARIO_CAMPO,
      capacidad: 35,
      piso: 'Territorial',
      pisoNivel: 0,
    },

    // ------------------------------------------------------------------------
    // Aldea Universitaria Cedeño (Caicara del Orinoco - Mcpio. General Manuel Cedeño)
    // ------------------------------------------------------------------------
    {
      sedeCodigo: 'ALDEA_CEDENO_CAICARA',
      codigo: 'ALD-CED-01',
      nombre: 'Aula Corozal 01',
      tipo: TipoEspacio.AULA_TEORICA,
      capacidad: 30,
      piso: 'Planta Baja',
      pisoNivel: 0,
    },
    {
      sedeCodigo: 'ALDEA_CEDENO_CAICARA',
      codigo: 'ALD-CED-02',
      nombre: 'Aula Bauxita 02',
      tipo: TipoEspacio.AULA_TEORICA,
      capacidad: 25,
      piso: 'Planta Baja',
      pisoNivel: 0,
    },
    {
      sedeCodigo: 'ALDEA_CEDENO_CAICARA',
      codigo: 'CAMPO-CEDENO-AGRO',
      nombre: 'Área Socioproductiva y Comunitaria Cedeño',
      tipo: TipoEspacio.ESPACIO_COMUNITARIO_CAMPO,
      capacidad: 30,
      piso: 'Territorial',
      pisoNivel: 0,
    },

    // ------------------------------------------------------------------------
    // Aldea Universitaria Gran Sabana (Santa Elena de Uairén - Mcpio. Gran Sabana)
    // ------------------------------------------------------------------------
    {
      sedeCodigo: 'ALDEA_GRAN_SABANA',
      codigo: 'ALD-GSA-01',
      nombre: 'Aula Intercultural Pemón 01',
      tipo: TipoEspacio.AULA_TEORICA,
      capacidad: 30,
      piso: 'Planta Baja',
      pisoNivel: 0,
    },
    {
      sedeCodigo: 'ALDEA_GRAN_SABANA',
      codigo: 'ALD-GSA-02',
      nombre: 'Aula Tepuy Roraima 02',
      tipo: TipoEspacio.AULA_TEORICA,
      capacidad: 25,
      piso: 'Planta Baja',
      pisoNivel: 0,
    },
    {
      sedeCodigo: 'ALDEA_GRAN_SABANA',
      codigo: 'ALD-GSA-LAB',
      nombre: 'Laboratorio de Tecnologías Akurimä',
      tipo: TipoEspacio.LABORATORIO_INFORMATICA,
      capacidad: 20,
      piso: 'Planta Baja',
      pisoNivel: 0,
    },
    {
      sedeCodigo: 'ALDEA_GRAN_SABANA',
      codigo: 'CAMPO-INDIGENA-TAUREPAN',
      nombre: 'Comunidad Indígena Kumarakapay / Taurepán (Campo/Comunidad)',
      tipo: TipoEspacio.ESPACIO_COMUNITARIO_CAMPO,
      capacidad: 40,
      piso: 'Territorial',
      pisoNivel: 0,
    },

    // ------------------------------------------------------------------------
    // Aldea Universitaria Roscio (Guasipati - Municipio Roscio)
    // ------------------------------------------------------------------------
    {
      sedeCodigo: 'ALDEA_ROSCIO_GUASIPATI',
      codigo: 'ALD-ROS-01',
      nombre: 'Aula Juan Germán Roscio',
      tipo: TipoEspacio.AULA_TEORICA,
      capacidad: 30,
      piso: 'Planta Baja',
      pisoNivel: 0,
    },
    {
      sedeCodigo: 'ALDEA_ROSCIO_GUASIPATI',
      codigo: 'ALD-ROS-02',
      nombre: 'Aula El Callao - Oro y Tradición',
      tipo: TipoEspacio.AULA_TEORICA,
      capacidad: 25,
      piso: 'Planta Baja',
      pisoNivel: 0,
    },
    {
      sedeCodigo: 'ALDEA_ROSCIO_GUASIPATI',
      codigo: 'CAMPO-MINERO-COMUNITARIO',
      nombre: 'Eje de Vinculación Minera y Socioproductiva Roscio',
      tipo: TipoEspacio.ESPACIO_COMUNITARIO_CAMPO,
      capacidad: 35,
      piso: 'Territorial',
      pisoNivel: 0,
    },

    // ------------------------------------------------------------------------
    // Aldea Universitaria Ciudad Piar (Municipio Bolivariano Angostura)
    // ------------------------------------------------------------------------
    {
      sedeCodigo: 'ALDEA_BOLIVARIANO_ANGOSTURA',
      codigo: 'ALD-CPI-01',
      nombre: 'Aula Cerro Bolívar',
      tipo: TipoEspacio.AULA_TEORICA,
      capacidad: 30,
      piso: 'Planta Baja',
      pisoNivel: 0,
    },
    {
      sedeCodigo: 'ALDEA_BOLIVARIANO_ANGOSTURA',
      codigo: 'CAMPO-LA-PARAGUA',
      nombre: 'Eje Sociocomunitario La Paragua (Campo)',
      tipo: TipoEspacio.ESPACIO_COMUNITARIO_CAMPO,
      capacidad: 30,
      piso: 'Territorial',
      pisoNivel: 0,
    },
  ];

  for (const esp of espaciosData) {
    const sedeId = sedesCreadas[esp.sedeCodigo];
    if (!sedeId) continue;

    const pisoNivel = esp.pisoNivel ?? normalizarNivelPiso(esp.piso);

    await prisma.espacioFisico.upsert({
      where: {
        sedeId_codigo: {
          sedeId,
          codigo: esp.codigo,
        },
      },
      update: {
        nombre: esp.nombre,
        tipo: esp.tipo,
        capacidad: esp.capacidad,
        piso: esp.piso,
        pisoNivel,
        activo: true,
      },
      create: {
        sedeId,
        codigo: esp.codigo,
        nombre: esp.nombre,
        tipo: esp.tipo,
        capacidad: esp.capacidad,
        piso: esp.piso,
        pisoNivel,
        activo: true,
      },
    });
    console.log(`[SEED-ESPACIOS] Espacio asegurado: [${esp.codigo}] ${esp.nombre} (${esp.tipo} - ${esp.piso})`);
  }

  console.log('[SEED-ESPACIOS] Siembra de Sedes y Espacios del Estado Bolívar culminada con éxito.');
}

if (require.main === module) {
  main()
    .catch((e) => {
      console.error('[SEED-ESPACIOS] Error sembrando espacios del Estado Bolívar:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
