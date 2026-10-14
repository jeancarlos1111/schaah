# language: es
# Marco de Ejecución: Pruebas automatizadas con Vitest (tests/acceptance/ y tests/domain/)
# Regla Mandatoria: Prohibido bypass o tests superficiales; cada escenario debe comprobar lógica real del sistema.
Característica: Cumplimiento de Restricciones y Asignación de Carga Horaria UBV (SAHAD)
  Como Coordinador Académico de la UBV
  Quiero que el sistema genere y valide horarios automáticamente
  Para garantizar la legalidad de la carga docente y optimizar el uso de espacios.

  Antecedentes:
    Dado que existe el período académico "2026-I"
    Y la sede central "Los Chaguaramos" con aulas disponibles
    Y la sede municipalizada "Aldea La Vega" con aulas disponibles

  # ===========================================================================
  # REGLA 1: LÍMITES LEGALES DE DEDICACIÓN DOCENTE (H-04, H-05)
  # ===========================================================================
  Escenario: No exceder el tope de docencia directa para Dedicación Exclusiva
    Dado un profesor "Carlos Gómez" con dedicación "DEDICACION_EXCLUSIVA"
    Y sus límites son mínimo 12 horas y máximo 16 horas de docencia directa
    Cuando el motor de optimización distribuye las secciones del PFG "Informática para la Gestión Social"
    Entonces el total de horas de docencia directa asignadas a "Carlos Gómez" debe estar entre 12 y 16 horas
    Y el estado normativo en el consolidado debe ser "EN_NORMA"

  Escenario: Rechazo de sobrecarga en ajuste manual
    Dado un profesor "Ana Rivas" con dedicación "TIEMPO_COMPLETO"
    Y tiene actualmente 12 horas de docencia directa asignadas (tope máximo alcanzado)
    Cuando el coordinador intenta asignar manualmente una sección adicional de 4 horas a "Ana Rivas"
    Entonces el validador en tiempo real debe retornar "es_valido: false"
    Y debe reportar la violación de restricción "H-04" con el mensaje "Tope máximo de 12 horas excedido"

  # ===========================================================================
  # REGLA 2: EXCLUSIÓN FÍSICA Y ANTI-SOLAPAMIENTO (H-01, H-02, H-03)
  # ===========================================================================
  Escenario: Dos secciones no pueden ocupar la misma aula a la misma hora
    Dado el aula "Piso 4 - Aula 402" con capacidad para 40 estudiantes
    Y la sección "INF-T1-A" asignada el "LUNES" de "08:15" a "09:45" en "Piso 4 - Aula 402"
    Cuando se intenta asignar la sección "EST-T1-B" el "LUNES" de "09:00" a "10:30" en "Piso 4 - Aula 402"
    Entonces la base de datos debe rechazar la inserción por infracción del constraint "no_solapamiento_aula"
    Y el motor de asignación debe descartar esa combinación en la fase de factibilidad

  Escenario: Un profesor no puede tener clases simultáneas
    Dado el profesor "Jesús Martínez" asignado a la sección "COM-T2-01" el "MARTES" de "10:00" a "11:30"
    Cuando el motor intenta programar la sección "PROY-T2-01" del mismo profesor el "MARTES" de "10:45" a "12:15"
    Entonces el motor descarta el slot por violación de la restricción "H-01"

  # ===========================================================================
  # REGLA 3: TRASLADO ENTRE SEDES TERRITORIALES (H-09)
  # ===========================================================================
  Escenario: Bloqueo de teletransportación entre Los Chaguaramos y Aldea La Vega
    Dado el profesor "Elena Blanco" con una clase en "Los Chaguaramos" que finaliza el "MIERCOLES" a las "12:00"
    Cuando se evalúa asignarle una clase en "Aldea La Vega" el mismo "MIERCOLES" con inicio a las "12:30"
    Entonces el validador debe rechazar la asignación por restricción "H-09"
    Y debe requerir un intervalo de traslado mínimo de 90 minutos entre ambas sedes

  # ===========================================================================
  # REGLA 4: UNIDADES DE PROYECTO SOCIOPRODUCTIVO Y CAMPO (H-08)
  # ===========================================================================
  Escenario: Unidad curricular Proyecto no consume aula física pero sí bloquea horario docente
    Dado una unidad curricular "Proyecto Comunitario III" marcada con "es_proyecto_comunitario: true"
    Cuando el sistema agenda el bloque de acompañamiento comunitario de 4 horas para la sección "PROY-INF-03"
    Entonces el registro en "horarios_seccion" debe tener "espacio_fisico_id: NULL"
    Y el "tipo_bloque" debe ser "PROYECTO_COMUNITARIO"
    Y el horario debe computarse para las horas de permanencia del docente
    Y ningún aula física del campus debe quedar reservada durante ese bloque

  # ===========================================================================
  # REGLA 5: AUDITORÍA DE AJUSTES MANUALES
  # ===========================================================================
  Escenario: Registro estricto de trazabilidad al modificar un horario
    Dado un horario preliminar generado automáticamente
    Cuando el usuario "coordinador_informatica" desplaza la sección "BD-T2" del "JUEVES 08:15" al "VIERNES 10:00"
    Y proporciona la justificación "Aprobado por Comisión Curricular"
    Entonces se crea un registro en "auditoria_ajustes_horarios"
    Y se almacena el estado previo en "datos_anteriores" y el nuevo en "datos_nuevos"
    Y el usuario responsable queda registrado como "coordinador_informatica"
