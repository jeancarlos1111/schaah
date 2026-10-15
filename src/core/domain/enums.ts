// Enums canónicos del dominio SAHAD UBV (Tipado estricto independiente de BD)

export enum RolUsuario {
  ADMINISTRADOR = 'ADMINISTRADOR',
  DIRECTOR_ACADEMICO = 'DIRECTOR_ACADEMICO',
  COORDINADOR_PFG = 'COORDINADOR_PFG',
  DOCENTE = 'DOCENTE',
}

export enum DedicacionDocente {
  DEDICACION_EXCLUSIVA = 'DEDICACION_EXCLUSIVA', // 36-40h perm / 12-16h doc
  TIEMPO_COMPLETO = 'TIEMPO_COMPLETO',           // 30-36h perm / 8-12h doc
  MEDIO_TIEMPO = 'MEDIO_TIEMPO',                 // 18-20h perm / 4-8h doc
  TIEMPO_CONVENCIONAL = 'TIEMPO_CONVENCIONAL',   // 2-12h perm / 2-12h doc
}

export enum EscalafonDocente {
  INSTRUCTOR = 'INSTRUCTOR',
  ASISTENTE = 'ASISTENTE',
  AGREGADO = 'AGREGADO',
  ASOCIADO = 'ASOCIADO',
  TITULAR = 'TITULAR',
  CONTRATADO = 'CONTRATADO',
  AUXILIAR_DOCENTE = 'AUXILIAR_DOCENTE',
}

export enum CondicionLaboral {
  ORDINARIO = 'ORDINARIO',
  CONTRATADO = 'CONTRATADO',
  JUBILADO_ACTIVO = 'JUBILADO_ACTIVO',
  COMISION_SERVICIO = 'COMISION_SERVICIO',
  POR_CONTRATAR = 'POR_CONTRATAR',
}

export enum TipoPrograma {
  PFG = 'PFG',         // Programa de Formación de Grado
  PNF = 'PNF',         // Programa Nacional de Formación
  PFA = 'PFA',         // Programa de Formación Avanzada (posgrado por cohortes)
  PIU = 'PIU',         // Programa de Iniciación Universitaria
  IDIOMAS = 'IDIOMAS', // Cursos de idiomas sin trayecto/tramo
}

export enum MallaGrupo {
  DIURNA = 'DIURNA',
  NOCTURNA = 'NOCTURNA',
}

export enum EstatusGrupo {
  APERTURA = 'APERTURA',
  CONTINUA = 'CONTINUA',
  CIERRA = 'CIERRA',
  FINALIZA = 'FINALIZA',
}

export enum TipoEspacio {
  AULA_TEORICA = 'AULA_TEORICA',
  LABORATORIO_INFORMATICA = 'LABORATORIO_INFORMATICA',
  LABORATORIO_CIENCIAS = 'LABORATORIO_CIENCIAS',
  TALLER = 'TALLER',
  AUDITORIO = 'AUDITORIO',
  ESPACIO_COMUNITARIO_CAMPO = 'ESPACIO_COMUNITARIO_CAMPO',
}

export enum DiaSemana {
  LUNES = 'LUNES',
  MARTES = 'MARTES',
  MIERCOLES = 'MIERCOLES',
  JUEVES = 'JUEVES',
  VIERNES = 'VIERNES',
  SABADO = 'SABADO',
  DOMINGO = 'DOMINGO',
}

export enum Turno {
  MATUTINO = 'MATUTINO',
  VESPERTINO = 'VESPERTINO',
  NOCTURNO = 'NOCTURNO',
  FIN_DE_SEMANA = 'FIN_DE_SEMANA',
  UNICA = 'UNICA',
}

export enum EstadoAsignacion {
  BORRADOR = 'BORRADOR',
  EN_OPTIMIZACION = 'EN_OPTIMIZACION',
  PRELIMINAR = 'PRELIMINAR',
  APROBADO_CONSEJO = 'APROBADO_CONSEJO',
  PUBLICADO = 'PUBLICADO',
}

export enum TipoBloqueAcademico {
  DOCENCIA_AULA = 'DOCENCIA_AULA',
  PROYECTO_COMUNITARIO = 'PROYECTO_COMUNITARIO',
  ASESORIA_TUTORIA = 'ASESORIA_TUTORIA',
  INVESTIGACION = 'INVESTIGACION',
  GESTION_ACADEMICA = 'GESTION_ACADEMICA',
}
