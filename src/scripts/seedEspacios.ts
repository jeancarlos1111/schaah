import prisma, { enableSqliteWal } from '../core/database/prisma';
import { TipoEspacio } from '../core/domain/enums';

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
      esAldeaMunicipalizada: false,
      activa: true,
    },
    {
      codigo: 'ALDEA_CARONI_PUERTO_ORDAZ',
      nombre: 'Aldea Universitaria Caroní (Puerto Ordaz)',
      ejeTerritorial: 'Eje Geopolítico Territorial Kerepakupai Vena',
      direccion: 'Sector Alta Vista / Unare, Puerto Ordaz, Mcpio. Caroní',
      esAldeaMunicipalizada: true,
      activa: true,
    },
    {
      codigo: 'ALDEA_PIAR_UPATA',
      nombre: 'Aldea Universitaria Upata',
      ejeTerritorial: 'Eje Geopolítico Territorial Kerepakupai Vena',
      direccion: 'Av. Valmore Rodríguez, Upata, Mcpio. Piar',
      esAldeaMunicipalizada: true,
      activa: true,
    },
    {
      codigo: 'ALDEA_CEDENO_CAICARA',
      nombre: 'Aldea Universitaria Caicara del Orinoco',
      ejeTerritorial: 'Eje Geopolítico Territorial Kerepakupai Vena',
      direccion: 'Av. Carabobo, Caicara del Orinoco, Mcpio. General Manuel Cedeño',
      esAldeaMunicipalizada: true,
      activa: true,
    },
    {
      codigo: 'ALDEA_GRAN_SABANA',
      nombre: 'Aldea Universitaria Santa Elena de Uairén',
      ejeTerritorial: 'Eje Geopolítico Territorial Kerepakupai Vena',
      direccion: 'Sector Akurimä, Santa Elena de Uairén, Mcpio. Gran Sabana',
      esAldeaMunicipalizada: true,
      activa: true,
    },
    {
      codigo: 'ALDEA_ROSCIO_GUASIPATI',
      nombre: 'Aldea Universitaria Guasipati',
      ejeTerritorial: 'Eje Geopolítico Territorial Kerepakupai Vena',
      direccion: 'Calle Bolívar, Casco Central, Guasipati, Mcpio. Roscio',
      esAldeaMunicipalizada: true,
      activa: true,
    },
    {
      codigo: 'ALDEA_BOLIVARIANO_ANGOSTURA',
      nombre: 'Aldea Universitaria Ciudad Piar',
      ejeTerritorial: 'Eje Geopolítico Territorial Kerepakupai Vena',
      direccion: 'Sector La Paragua / Ciudad Piar, Mcpio. Bolivariano Angostura',
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

  // 2. Aulas, Laboratorios, Auditorios y Espacios de Campo en Estado Bolívar
  const espaciosData = [
    // ------------------------------------------------------------------------
    // Sede Principal Ciudad Bolívar (Municipio Angostura del Orinoco)
    // ------------------------------------------------------------------------
    {
      sedeCodigo: 'SEDE_BOLIVAR_ANGOSTURA',
      codigo: 'AUL-101',
      nombre: 'Aula 101 - Congreso de Angostura',
      tipo: TipoEspacio.AULA_TEORICA,
      capacidad: 40,
      piso: 'Piso 1',
    },
    {
      sedeCodigo: 'SEDE_BOLIVAR_ANGOSTURA',
      codigo: 'AUL-102',
      nombre: 'Aula 102 - General Manuel Piar',
      tipo: TipoEspacio.AULA_TEORICA,
      capacidad: 35,
      piso: 'Piso 1',
    },
    {
      sedeCodigo: 'SEDE_BOLIVAR_ANGOSTURA',
      codigo: 'AUL-103',
      nombre: 'Aula 103 - General Tomás de Heres',
      tipo: TipoEspacio.AULA_TEORICA,
      capacidad: 35,
      piso: 'Piso 1',
    },
    {
      sedeCodigo: 'SEDE_BOLIVAR_ANGOSTURA',
      codigo: 'AUL-201',
      nombre: 'Aula 201 - Simón Rodríguez',
      tipo: TipoEspacio.AULA_TEORICA,
      capacidad: 45,
      piso: 'Piso 2',
    },
    {
      sedeCodigo: 'SEDE_BOLIVAR_ANGOSTURA',
      codigo: 'LAB-INFO-01',
      nombre: 'Laboratorio 1 de Software Libre y Desarrollo',
      tipo: TipoEspacio.LABORATORIO_INFORMATICA,
      capacidad: 28,
      piso: 'Piso 2',
    },
    {
      sedeCodigo: 'SEDE_BOLIVAR_ANGOSTURA',
      codigo: 'LAB-INFO-02',
      nombre: 'Laboratorio 2 de Telemática y Redes',
      tipo: TipoEspacio.LABORATORIO_INFORMATICA,
      capacidad: 25,
      piso: 'Piso 2',
    },
    {
      sedeCodigo: 'SEDE_BOLIVAR_ANGOSTURA',
      codigo: 'LAB-GEO-MINAS',
      nombre: 'Laboratorio de Geociencias y Gestión Ambiental',
      tipo: TipoEspacio.LABORATORIO_CIENCIAS,
      capacidad: 22,
      piso: 'Planta Baja',
    },
    {
      sedeCodigo: 'SEDE_BOLIVAR_ANGOSTURA',
      codigo: 'AUD-BICENTENARIO',
      nombre: 'Auditorio Bicentenario de Angostura',
      tipo: TipoEspacio.AUDITORIO,
      capacidad: 150,
      piso: 'Planta Baja',
    },
    {
      sedeCodigo: 'SEDE_BOLIVAR_ANGOSTURA',
      codigo: 'CAMPO-ORINOCO',
      nombre: 'Eje Comunitario Ribera del Orinoco (Comunidad/Campo)',
      tipo: TipoEspacio.ESPACIO_COMUNITARIO_CAMPO,
      capacidad: 50,
      piso: 'Territorial',
    },

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
    },
    {
      sedeCodigo: 'ALDEA_CARONI_PUERTO_ORDAZ',
      codigo: 'ALD-CAR-02',
      nombre: 'Aula Cacique Caroní',
      tipo: TipoEspacio.AULA_TEORICA,
      capacidad: 30,
      piso: 'Piso 1',
    },
    {
      sedeCodigo: 'ALDEA_CARONI_PUERTO_ORDAZ',
      codigo: 'ALD-CAR-LAB',
      nombre: 'Laboratorio de Sistemas e Informática Caroní',
      tipo: TipoEspacio.LABORATORIO_INFORMATICA,
      capacidad: 25,
      piso: 'Planta Baja',
    },
    {
      sedeCodigo: 'ALDEA_CARONI_PUERTO_ORDAZ',
      codigo: 'CAMPO-COMUNA-CARONI',
      nombre: 'Comuna Socioproductiva San Félix (Comunidad/Campo)',
      tipo: TipoEspacio.ESPACIO_COMUNITARIO_CAMPO,
      capacidad: 40,
      piso: 'Territorial',
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
    },
    {
      sedeCodigo: 'ALDEA_PIAR_UPATA',
      codigo: 'ALD-PIA-02',
      nombre: 'Aula Manuel Piar 02',
      tipo: TipoEspacio.AULA_TEORICA,
      capacidad: 28,
      piso: 'Planta Baja',
    },
    {
      sedeCodigo: 'ALDEA_PIAR_UPATA',
      codigo: 'ALD-PIA-LAB',
      nombre: 'Laboratorio Comunitario Upata',
      tipo: TipoEspacio.LABORATORIO_INFORMATICA,
      capacidad: 20,
      piso: 'Planta Baja',
    },
    {
      sedeCodigo: 'ALDEA_PIAR_UPATA',
      codigo: 'CAMPO-VALLE-YOCOIMA',
      nombre: 'Eje Productivo Agroecológico Valle del Yocoima',
      tipo: TipoEspacio.ESPACIO_COMUNITARIO_CAMPO,
      capacidad: 35,
      piso: 'Territorial',
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
    },
    {
      sedeCodigo: 'ALDEA_CEDENO_CAICARA',
      codigo: 'ALD-CED-02',
      nombre: 'Aula Bauxita 02',
      tipo: TipoEspacio.AULA_TEORICA,
      capacidad: 25,
      piso: 'Planta Baja',
    },
    {
      sedeCodigo: 'ALDEA_CEDENO_CAICARA',
      codigo: 'CAMPO-CEDENO-AGRO',
      nombre: 'Área Socioproductiva y Comunitaria Cedeño',
      tipo: TipoEspacio.ESPACIO_COMUNITARIO_CAMPO,
      capacidad: 30,
      piso: 'Territorial',
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
    },
    {
      sedeCodigo: 'ALDEA_GRAN_SABANA',
      codigo: 'ALD-GSA-02',
      nombre: 'Aula Tepuy Roraima 02',
      tipo: TipoEspacio.AULA_TEORICA,
      capacidad: 25,
      piso: 'Planta Baja',
    },
    {
      sedeCodigo: 'ALDEA_GRAN_SABANA',
      codigo: 'ALD-GSA-LAB',
      nombre: 'Laboratorio de Tecnologías Akurimä',
      tipo: TipoEspacio.LABORATORIO_INFORMATICA,
      capacidad: 20,
      piso: 'Planta Baja',
    },
    {
      sedeCodigo: 'ALDEA_GRAN_SABANA',
      codigo: 'CAMPO-INDIGENA-TAUREPAN',
      nombre: 'Comunidad Indígena Kumarakapay / Taurepán (Campo/Comunidad)',
      tipo: TipoEspacio.ESPACIO_COMUNITARIO_CAMPO,
      capacidad: 40,
      piso: 'Territorial',
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
    },
    {
      sedeCodigo: 'ALDEA_ROSCIO_GUASIPATI',
      codigo: 'ALD-ROS-02',
      nombre: 'Aula El Callao - Oro y Tradición',
      tipo: TipoEspacio.AULA_TEORICA,
      capacidad: 25,
      piso: 'Planta Baja',
    },
    {
      sedeCodigo: 'ALDEA_ROSCIO_GUASIPATI',
      codigo: 'CAMPO-MINERO-COMUNITARIO',
      nombre: 'Eje de Vinculación Minera y Socioproductiva Roscio',
      tipo: TipoEspacio.ESPACIO_COMUNITARIO_CAMPO,
      capacidad: 35,
      piso: 'Territorial',
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
    },
    {
      sedeCodigo: 'ALDEA_BOLIVARIANO_ANGOSTURA',
      codigo: 'CAMPO-LA-PARAGUA',
      nombre: 'Eje Sociocomunitario La Paragua (Campo)',
      tipo: TipoEspacio.ESPACIO_COMUNITARIO_CAMPO,
      capacidad: 30,
      piso: 'Territorial',
    },
  ];

  for (const esp of espaciosData) {
    const sedeId = sedesCreadas[esp.sedeCodigo];
    if (!sedeId) continue;

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
        activo: true,
      },
      create: {
        sedeId,
        codigo: esp.codigo,
        nombre: esp.nombre,
        tipo: esp.tipo,
        capacidad: esp.capacidad,
        piso: esp.piso,
        activo: true,
      },
    });
    console.log(`[SEED-ESPACIOS] Espacio asegurado: [${esp.codigo}] ${esp.nombre} (${esp.tipo})`);
  }

  console.log('[SEED-ESPACIOS] Siembra de Sedes y Espacios del Estado Bolívar culminada con éxito.');
}

main()
  .catch((e) => {
    console.error('[SEED-ESPACIOS] Error sembrando espacios del Estado Bolívar:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
