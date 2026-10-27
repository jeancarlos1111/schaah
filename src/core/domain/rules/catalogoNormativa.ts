/** Catálogo de restricciones de la Spec 01 (sección 4), tal como se muestra en Normativa. */
export interface ReglaNormativa {
  codigo: string;
  nombre: string;
  descripcion: string;
  peso?: number;
}

export const RESTRICCIONES_DURAS: ReglaNormativa[] = [
  {
    codigo: 'H-01',
    nombre: 'No solapamiento docente',
    descripcion: 'Un docente no puede tener dos clases (en aula o en campo) en el mismo bloque.',
  },
  {
    codigo: 'H-02',
    nombre: 'No solapamiento de aula',
    descripcion: 'Un espacio físico no puede albergar más de una sección en el mismo bloque.',
  },
  {
    codigo: 'H-03',
    nombre: 'No solapamiento de cohorte',
    descripcion: 'Los estudiantes de una misma cohorte no pueden tener dos unidades curriculares al mismo tiempo.',
  },
  {
    codigo: 'H-04',
    nombre: 'Límite máximo de docencia directa',
    descripcion: 'Las horas lectivas semanales del docente no superan el tope de su dedicación.',
  },
  {
    codigo: 'H-05',
    nombre: 'Límite mínimo de docencia directa',
    descripcion:
      'Un docente activo cumple el mínimo de su dedicación, salvo causal registrada (descarga sindical, sabático o jefatura).',
  },
  {
    codigo: 'H-06',
    nombre: 'Disponibilidad docente respetada',
    descripcion: 'Las clases solo se programan en las franjas que el docente declaró disponibles en el período.',
  },
  {
    codigo: 'H-07',
    nombre: 'Capacidad del aula y prelaciones',
    descripcion:
      'El aforo del aula cubre la matrícula de la sección, y una unidad no coincide en horario con su prelación directa.',
  },
  {
    codigo: 'H-08',
    nombre: 'Tipo de espacio adecuado',
    descripcion:
      'La teoría va en aula, el laboratorio en un laboratorio compatible y el Proyecto Comunitario en campo, sin reservar aula.',
  },
  {
    codigo: 'H-09',
    nombre: 'Traslado entre sedes',
    descripcion: 'Entre clases del mismo docente en sedes distintas el mismo día hay al menos 90 minutos.',
  },
  {
    codigo: 'H-10',
    nombre: 'Integridad del bloque curricular',
    descripcion: 'Las unidades se dictan en bloques continuos de 90 o 135 minutos, nunca en bloques aislados de 45.',
  },
  {
    codigo: 'H-13',
    nombre: 'Reserva institucional de los martes',
    descripcion:
      'Los martes de 10:45 AM a 12:15 PM están reservados institucionalmente para reuniones de Dirección, PFG, PIU y Formación General; prohibido programar clases.',
  },
  {
    codigo: 'H-14',
    nombre: 'Bloque fijo institucional de Liderazgo',
    descripcion:
      'Liderazgo 1 se dicta los jueves en el bloque 1 (07:30 AM a 09:00 AM) y Liderazgo 2 en el bloque 2 (09:05 AM a 10:35 AM), con docente disponible los jueves.',
  },
];

export const RESTRICCIONES_BLANDAS: ReglaNormativa[] = [
  { codigo: 'S-01', nombre: 'Minimizar huecos docentes', descripcion: 'Evitar horas muertas entre clases de un docente el mismo día.', peso: 80 },
  { codigo: 'S-02', nombre: 'Preferencia horaria del docente', descripcion: 'Usar primero las franjas de prioridad alta del docente.', peso: 60 },
  { codigo: 'S-03', nombre: 'Compactación por sección', descripcion: 'Agrupar las materias de una cohorte en días contiguos o en su turno.', peso: 90 },
  { codigo: 'S-04', nombre: 'Distribución equitativa de carga', descripcion: 'Repartir la carga de docentes con igual dedicación a lo largo de la semana.', peso: 40 },
  { codigo: 'S-05', nombre: 'Concentración semanal', descripcion: 'Concentrar la docencia en 3 o 4 días, liberando días para investigación y comunidad.', peso: 70 },
  { codigo: 'S-06', nombre: 'Misma aula para la misma sección', descripcion: 'Mantener a la sección en la misma aula en materias consecutivas del día.', peso: 50 },
  { codigo: 'S-07', nombre: 'Jornada continua', descripcion: 'Evitar más de 6 horas académicas continuas de docencia directa al día.', peso: 75 },
  { codigo: 'S-08', nombre: 'Uso eficiente de aulas especiales', descripcion: 'Reservar los laboratorios para las materias que los requieren.', peso: 85 },
];
