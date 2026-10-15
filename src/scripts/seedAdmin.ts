import bcrypt from 'bcryptjs';
import prisma, { enableSqliteWal } from '../core/database/prisma';
import { RolUsuario, CondicionLaboral, EscalafonDocente } from '../core/domain/enums';

async function main() {
  console.log('[SEED] Conectando a SQLite y activando modo WAL...');
  await enableSqliteWal();
  console.log('[SEED] Iniciando siembra de catálogo de permisos, roles y usuarios...');

  // 1. Catálogo Canónico de Permisos
  const permisosCatalogo = [
    // Usuarios
    { codigo: 'usuarios.ver', nombre: 'Ver Usuarios', modulo: 'USUARIOS', descripcion: 'Visualizar listado de usuarios' },
    { codigo: 'usuarios.crear', nombre: 'Crear Usuarios', modulo: 'USUARIOS', descripcion: 'Registrar nuevas cuentas en el sistema' },
    { codigo: 'usuarios.editar', nombre: 'Editar Usuarios', modulo: 'USUARIOS', descripcion: 'Modificar datos de usuario y reestablecer claves' },
    { codigo: 'usuarios.roles', nombre: 'Gestionar Roles y Permisos', modulo: 'USUARIOS', descripcion: 'Administrar roles y matriz de permisos' },
    
    // Espacios
    { codigo: 'espacios.ver', nombre: 'Ver Sedes y Aulas', modulo: 'ESPACIOS', descripcion: 'Consultar espacios físicos y capacidades' },
    { codigo: 'espacios.gestionar', nombre: 'Gestionar Espacios', modulo: 'ESPACIOS', descripcion: 'Crear y editar sedes y aulas' },

    // Docentes y Disponibilidad
    { codigo: 'docentes.ver', nombre: 'Ver Docentes', modulo: 'DOCENTES', descripcion: 'Consultar cuerpo docente y escalafón' },
    { codigo: 'docentes.disponibilidad_propia', nombre: 'Disponibilidad Propia', modulo: 'DOCENTES', descripcion: 'Registrar franjas horarias propias' },
    { codigo: 'docentes.disponibilidad_todos', nombre: 'Disponibilidad General', modulo: 'DOCENTES', descripcion: 'Editar disponibilidad de cualquier docente' },

    // Horarios y Optimización
    { codigo: 'horarios.ver', nombre: 'Ver Horarios', modulo: 'HORARIOS', descripcion: 'Consultar cuadrícula de horarios' },
    { codigo: 'horarios.optimizar', nombre: 'Ejecutar Solver CP-SAT', modulo: 'HORARIOS', descripcion: 'Disparar motor de asignación automática' },
    { codigo: 'horarios.ajuste_manual', nombre: 'Ajuste Manual Drag & Drop', modulo: 'HORARIOS', descripcion: 'Modificar horarios manualmente con justificación' },

    // Reportes y Exportación
    { codigo: 'reportes.ver', nombre: 'Ver Planillas de Carga', modulo: 'REPORTES', descripcion: 'Consultar consolidado de carga horaria' },
    { codigo: 'reportes.exportar_sur', nombre: 'Exportar SUR@UBV', modulo: 'REPORTES', descripcion: 'Generar archivos compatibles con SUR@UBV' },
  ];

  for (const perm of permisosCatalogo) {
    await prisma.permiso.upsert({
      where: { codigo: perm.codigo },
      update: { nombre: perm.nombre, modulo: perm.modulo, descripcion: perm.descripcion },
      create: perm,
    });
  }
  console.log(`[SEED] ${permisosCatalogo.length} Permisos base registrados en catálogo.`);

  // 2. Roles Base del Sistema
  const rolesBase = [
    {
      codigo: 'ADMINISTRADOR',
      nombre: 'Administrador del Sistema',
      descripcion: 'Acceso total y configuración global de la plataforma',
      esSistema: true,
      permisos: permisosCatalogo.map(p => p.codigo), // Todos los permisos
    },
    {
      codigo: 'DIRECTOR_ACADEMICO',
      nombre: 'Director Académico',
      descripcion: 'Supervisión académica, aprobación de períodos y control normativo',
      esSistema: true,
      permisos: [
        'usuarios.ver',
        'espacios.ver', 'espacios.gestionar',
        'docentes.ver', 'docentes.disponibilidad_todos',
        'horarios.ver', 'horarios.optimizar', 'horarios.ajuste_manual',
        'reportes.ver', 'reportes.exportar_sur',
      ],
    },
    {
      codigo: 'COORDINADOR_PFG',
      nombre: 'Coordinador de PFG',
      descripcion: 'Planificación de unidades curriculares, secciones y optimización de PFG',
      esSistema: true,
      permisos: [
        'espacios.ver',
        'docentes.ver',
        'horarios.ver', 'horarios.optimizar', 'horarios.ajuste_manual',
        'reportes.ver', 'reportes.exportar_sur',
      ],
    },
    {
      codigo: 'DOCENTE',
      nombre: 'Profesor Docente',
      descripcion: 'Consulta de asignación académica y registro de disponibilidad horaria',
      esSistema: true,
      permisos: [
        'docentes.disponibilidad_propia',
        'horarios.ver',
        'reportes.ver',
      ],
    },
  ];

  for (const rolData of rolesBase) {
    const rol = await prisma.rol.upsert({
      where: { codigo: rolData.codigo },
      update: { nombre: rolData.nombre, descripcion: rolData.descripcion },
      create: {
        codigo: rolData.codigo,
        nombre: rolData.nombre,
        descripcion: rolData.descripcion,
        esSistema: rolData.esSistema,
      },
    });

    // Asignar permisos al rol
    for (const permCod of rolData.permisos) {
      const permiso = await prisma.permiso.findUnique({ where: { codigo: permCod } });
      if (permiso) {
        await prisma.rolPermiso.upsert({
          where: {
            rolId_permisoId: { rolId: rol.id, permisoId: permiso.id },
          },
          update: {},
          create: {
            rolId: rol.id,
            permisoId: permiso.id,
          },
        });
      }
    }
  }
  console.log('[SEED] Roles y asignaciones de permisos sembrados con éxito.');

  // 3. Usuarios de Prueba
  const passwordHash = await bcrypt.hash('ubv2026', 10);
  const rolAdmin = await prisma.rol.findUnique({ where: { codigo: 'ADMINISTRADOR' } });
  const rolDirector = await prisma.rol.findUnique({ where: { codigo: 'DIRECTOR_ACADEMICO' } });
  const rolCoord = await prisma.rol.findUnique({ where: { codigo: 'COORDINADOR_PFG' } });
  const rolDocente = await prisma.rol.findUnique({ where: { codigo: 'DOCENTE' } });

  // Administrador
  await prisma.usuario.upsert({
    where: { email: 'admin@ubv.edu.ve' },
    update: { rolRelacionId: rolAdmin?.id },
    create: {
      email: 'admin@ubv.edu.ve',
      passwordHash,
      nombres: 'Administrador',
      apellidos: 'Sistema',
      rol: RolUsuario.ADMINISTRADOR,
      rolRelacionId: rolAdmin?.id,
    },
  });

  // Director
  await prisma.usuario.upsert({
    where: { email: 'director.academico@ubv.edu.ve' },
    update: { rolRelacionId: rolDirector?.id },
    create: {
      email: 'director.academico@ubv.edu.ve',
      passwordHash,
      nombres: 'María',
      apellidos: 'Rodríguez',
      rol: RolUsuario.DIRECTOR_ACADEMICO,
      rolRelacionId: rolDirector?.id,
    },
  });

  // Coordinador (alcance: PFG Informática para la Gestión Social)
  const coordinador = await prisma.usuario.upsert({
    where: { email: 'coord.informatica@ubv.edu.ve' },
    update: { rolRelacionId: rolCoord?.id },
    create: {
      email: 'coord.informatica@ubv.edu.ve',
      passwordHash,
      nombres: 'Pedro',
      apellidos: 'Pérez',
      rol: RolUsuario.COORDINADOR_PFG,
      rolRelacionId: rolCoord?.id,
    },
  });
  const pfgInformatica = await prisma.programaFormacion.upsert({
    where: { codigo: 'PFG-INFO' },
    update: {},
    create: {
      codigo: 'PFG-INFO',
      nombre: 'Informática para la Gestión Social',
      areaConocimiento: 'Tecnología y Ciencias Aplicadas',
    },
  });
  await prisma.usuarioPrograma.upsert({
    where: { usuarioId_pfgId: { usuarioId: coordinador.id, pfgId: pfgInformatica.id } },
    update: {},
    create: { usuarioId: coordinador.id, pfgId: pfgInformatica.id },
  });

  // Docente
  const docenteProfesor = await prisma.profesor.upsert({
    where: { cedula: 'V-15890123' },
    update: {},
    create: {
      cedula: 'V-15890123',
      nombres: 'Carlos',
      apellidos: 'Gómez',
      email: 'carlos.gomez@ubv.edu.ve',
      telefono: '0414-1234567',
      condicion: CondicionLaboral.ORDINARIO,
      escalafon: EscalafonDocente.ASISTENTE,
    },
  });

  await prisma.usuario.upsert({
    where: { email: 'carlos.gomez@ubv.edu.ve' },
    update: { rolRelacionId: rolDocente?.id, profesorId: docenteProfesor.id },
    create: {
      email: 'carlos.gomez@ubv.edu.ve',
      passwordHash,
      nombres: 'Carlos',
      apellidos: 'Gómez',
      rol: RolUsuario.DOCENTE,
      rolRelacionId: rolDocente?.id,
      profesorId: docenteProfesor.id,
    },
  });

  console.log('[SEED] Base de datos de roles, permisos y usuarios 100% lista.');
}

main()
  .catch((e) => {
    console.error('[SEED] Error sembrando datos:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
