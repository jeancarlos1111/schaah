# language: es
# Marco de ejecución: los escenarios se ejecutan con Vitest mediante @amiceli/vitest-cucumber.
#   Pasos en tests/acceptance/*.steps.test.ts (un archivo por regla, filtrado por su etiqueta).
#   Comando: pnpm test:acceptance  (también forman parte de pnpm test).
# Regla mandatoria: prohibido bypass o pruebas superficiales; cada paso invoca la lógica real del
#   sistema (validador, motor genético, evaluador, controladores y servicios sobre una base SQLite efímera).
Característica: Cumplimiento de Restricciones y Asignación de Carga Horaria UBV (SAHAD)
  Como Coordinador Académico de la UBV
  Quiero que el sistema genere y valide horarios automáticamente
  Para garantizar la legalidad de la carga docente y optimizar el uso de espacios.

  # ===========================================================================
  # REGLA 1: LÍMITES LEGALES DE DEDICACIÓN DOCENTE (H-04, H-05)
  # ===========================================================================
  @dedicacion
  Regla: Límites legales de dedicación docente (H-04, H-05)

    Escenario: El motor distribuye la carga de un docente a Dedicación Exclusiva dentro de la norma
      Dado un profesor "Carlos Gómez" con dedicación "DEDICACION_EXCLUSIVA" disponible en los bloques oficiales del turno matutino
      Y 4 secciones de 4 horas del PFG "Informática para la Gestión Social" asignadas a "Carlos Gómez" sin horario
      Cuando el motor genético distribuye las secciones
      Entonces cada bloque propuesto coincide con un bloque oficial de 90 minutos
      Y el evaluador no reporta violaciones duras
      Y la carga de "Carlos Gómez" suma 16 horas con estado normativo "EN_NORMA"

    Escenario: Rechazo de sobrecarga en ajuste manual
      Dado un profesor "Ana Rivas" con dedicación "TIEMPO_COMPLETO" registrada en el período
      Y "Ana Rivas" tiene 3 asignaciones de 4 horas en el período
      Cuando el coordinador asigna a "Ana Rivas" una asignación adicional de 4 horas
      Entonces la asignación se rechaza con el mensaje "Violación de H-04: Asignar esta sección elevaría la carga a 16h (Tope legal: 12h para TIEMPO_COMPLETO)."
      Y la asignación adicional sigue sin docente

  # ===========================================================================
  # REGLA 2: EXCLUSIÓN FÍSICA Y ANTI-SOLAPAMIENTO (H-01, H-02, H-03)
  # ===========================================================================
  @solapamiento
  Regla: Exclusión física y anti-solapamiento (H-01, H-02, H-03)

    Escenario: Dos secciones no pueden ocupar la misma aula a la misma hora
      Dado el aula "Piso 4 - Aula 402" con capacidad para 40 estudiantes
      Y la sección "INF-T1-A" programada el "LUNES" de "07:30" a "09:00" en "Piso 4 - Aula 402"
      Cuando el coordinador mueve la sección "EST-T1-B" al "LUNES" de "07:30" a "09:00" en "Piso 4 - Aula 402"
      Entonces el servidor responde 409 citando la restricción "H-02"
      Y la sección "EST-T1-B" no queda programada
      Y el evaluador del motor marca "H-02" para esa combinación

    Escenario: Los estudiantes de una misma cohorte no pueden tener dos materias a la vez
      Dada la cohorte "KV-BO-RC-01-A-M" con las asignaciones "Matemática" y "Lenguaje"
      Y "Matemática" programada el "LUNES" de "07:30" a "09:00"
      Cuando se intenta programar "Lenguaje" el "LUNES" de "07:30" a "09:00"
      Entonces el validador rechaza el movimiento por la restricción "H-03" indicando el grupo "KV-BO-RC-01-A-M"
      Pero una asignación de la cohorte "KV-BO-RC-02-A-M" sí puede ocupar ese mismo horario

    Escenario: Un profesor no puede tener clases simultáneas
      Dado el profesor "Jesús Martínez" con la sección "COM-T2-01" programada el "MARTES" de "09:05" a "10:35"
      Y "Jesús Martínez" solo está disponible el "MARTES" de "07:30" a "09:00" y de "09:05" a "10:35"
      Cuando se evalúa programar su sección "PROY-T2-01" el "MARTES" de "09:05" a "10:35"
      Entonces el evaluador descarta la combinación por la restricción "H-01"
      Y el motor genético programa "PROY-T2-01" el "MARTES" a las "07:30"

  # ===========================================================================
  # REGLA 3: TRASLADO ENTRE SEDES TERRITORIALES (H-09)
  # ===========================================================================
  @traslado
  Regla: Traslado entre sedes territoriales (H-09)

    Escenario: Bloqueo de teletransportación entre Los Chaguaramos y Aldea La Vega
      Dado el profesor "Elena Blanco" con una clase en "Los Chaguaramos" el "MIERCOLES" de "07:30" a "09:00"
      Cuando se evalúa asignarle una clase en "Aldea La Vega" el mismo "MIERCOLES" de "09:05" a "10:35"
      Entonces el validador rechaza la asignación por la restricción "H-09" con una brecha de 5 minutos
      Pero la misma clase de "10:45" a "12:15" sí se acepta porque deja 105 minutos de traslado

  # ===========================================================================
  # REGLA 4: UNIDADES DE PROYECTO SOCIOPRODUCTIVO Y CAMPO (H-08)
  # ===========================================================================
  @proyecto
  Regla: Proyecto comunitario sin aula física (H-08)

    Escenario: El motor agenda el proyecto comunitario sin reservar aula
      Dada la unidad curricular "Proyecto Comunitario III" marcada como proyecto comunitario
      Y su sección "PROY-INF-03" de 4 horas sin horario en una sede con aulas libres
      Cuando el motor genético agenda sus bloques
      Entonces ningún bloque propuesto reserva espacio físico
      Y el tipo de bloque propuesto es "PROYECTO_COMUNITARIO"
      Y el evaluador marca "H-08" si a ese bloque se le asigna un aula

    Escenario: Colocar el proyecto en la matriz no reserva el aula indicada
      Dada la sección de proyecto "PROY-INF-03" con su docente asignado
      Cuando el coordinador la coloca el "JUEVES" de "07:30" a "09:00" indicando el aula "Piso 4 - Aula 402"
      Entonces el bloque se guarda con "espacio_fisico_id" nulo y tipo "PROYECTO_COMUNITARIO"
      Y el bloque ocupa el horario del docente para otra sección el "JUEVES" a las "07:30"
      Y el aula "Piso 4 - Aula 402" sigue libre el "JUEVES" a las "07:30"

  # ===========================================================================
  # REGLA 5: AUDITORÍA DE AJUSTES MANUALES
  # ===========================================================================
  @auditoria
  Regla: Auditoría de ajustes manuales

    Escenario: Registro estricto de trazabilidad al modificar un horario
      Dado un horario de la sección "BD-T2" el "JUEVES" de "07:30" a "09:00"
      Cuando el usuario "coord.informatica@ubv.edu.ve" mueve la sección "BD-T2" al "VIERNES" de "10:45" a "12:15" con la justificación "Aprobado por Comisión Curricular"
      Entonces se crea un registro de auditoría de tipo "AJUSTE_MANUAL_MOVIMIENTO"
      Y los datos anteriores registran "JUEVES" a las "07:30" y los nuevos "VIERNES" a las "10:45"
      Y el usuario responsable queda registrado como "coord.informatica@ubv.edu.ve" con la justificación "Aprobado por Comisión Curricular"

  # ===========================================================================
  # REGLA 6: MALLAS CURRICULARES (RC-06, RC-07)
  # ===========================================================================
  @mallas
  Regla: Mallas curriculares (RC-06, RC-07)

    Escenario: Una unidad de un programa PFA se guarda sin trayecto ni tramo
      Dado el programa "PFA" de tipo "PFA" con la unidad "PFA-C" en el Trayecto 1, Tramo 1
      Cuando el coordinador edita la unidad "PFA-C" dejando Trayecto y Tramo vacíos
      Entonces la unidad "PFA-C" queda sin trayecto ni tramo

    Escenario: Una unidad de un PFG exige trayecto y tramo
      Dada la unidad "ARQ-DIS.620" del PFG "ARQ" importada sin trayecto desde la oferta
      Cuando el coordinador guarda la unidad "ARQ-DIS.620" sin trayecto ni tramo
      Entonces el sistema responde con un error que contiene "Violación RC-06"
      Y la unidad "ARQ-DIS.620" sigue sin trayecto

    Escenario: Editar una unidad conserva sus prelaciones
      Dada la unidad "INF-301" en el Trayecto 3, Tramo 5 prelada por "INF-101" en el Trayecto 1, Tramo 1
      Cuando se edita el nombre de "INF-301" desde un formulario que no envía el selector de prelaciones
      Entonces "INF-101" sigue siendo prelación de "INF-301"

    Escenario: No se puede mover un requisito después de la unidad que lo necesita
      Dada la unidad "INF-301" en el Trayecto 3, Tramo 5 prelada por "INF-101" en el Trayecto 1, Tramo 1
      Cuando se intenta mover "INF-101" al Trayecto 4, Tramo 7
      Entonces el sistema responde con un error que contiene "Violación RC-07"
      Y el error menciona "INF-301"
      Y "INF-101" sigue en el Trayecto 1, Tramo 1

  # ===========================================================================
  # REGLA 7: OFERTA DE CARGA HORARIA (Spec 10)
  # ===========================================================================
  @oferta
  Regla: Oferta de carga horaria (Spec 10)

    Escenario: La importación respalda la base y deja bitácora
      Dado un consolidado "OFERTA_2026-II.xlsx" analizado en vista previa por el director
      Cuando el director confirma la importación
      Entonces se crea un respaldo "antes-oferta-oferta-2026-ii.db" en el directorio de respaldos
      Y el respaldo no contiene las asignaciones importadas
      Y la base contiene las 9 asignaciones del consolidado
      Y se registra una importación de "OFERTA_2026-II.xlsx" a nombre del director con las dedicaciones contradictorias

    Escenario: Reimportar el mismo consolidado no duplica datos
      Dado que el consolidado ya fue aplicado al período "2026-II"
      Cuando se vuelve a analizar el mismo archivo
      Entonces el plan no propone cohortes, unidades ni asignaciones nuevas

    Escenario: Confirmar un código provisional
      Dada la unidad "PIU-SC" con código provisional
      Cuando el director guarda el código "PIU-SEM-001" desde la página de inconsistencias
      Entonces la unidad deja de figurar en "Códigos provisionales"
      Y una nueva importación del consolidado reutiliza la unidad "PIU-SEM-001" por su nombre

  # ===========================================================================
  # REGLA 8: ALCANCE DEL COORDINADOR POR PROGRAMA (Spec 06)
  # ===========================================================================
  @coordinador
  Regla: Alcance del coordinador por programa (Spec 06)

    Antecedentes:
      Dado el coordinador "coord.informatica@ubv.edu.ve" asignado solo al programa "PFG-INFO"
      Y el programa ajeno "PFG-ARQ" con la unidad "ARQ-101" y una asignación pendiente "ARQ-101-A"
      Y el programa "PFG-INFO" con la unidad "INF-101" y una asignación pendiente "INF-101-A"

    Escenario: El coordinador no puede editar una unidad de otro programa
      Cuando el coordinador intenta renombrar la unidad "ARQ-101"
      Entonces el servidor responde 403
      Y la unidad "ARQ-101" conserva su nombre

    Escenario: El listado de asignaciones muestra solo sus programas
      Cuando el coordinador consulta las asignaciones del período
      Entonces solo aparece la asignación "INF-101-A"
      Y el filtro de programas solo ofrece "PFG-INFO"

    Escenario: El solver programa solo sus pendientes y respeta los horarios de otros programas
      Dado que "ARQ-101-A" ya ocupa el aula "A-01" el "LUNES" de "07:30" a "09:00"
      Y "INF-101-A" solo puede dictarse el "LUNES" a las "07:30" o a las "09:05"
      Cuando el coordinador ejecuta el motor genético
      Entonces la propuesta solo incluye bloques de "INF-101-A"
      Y "INF-101-A" queda el "LUNES" a las "09:05" en el aula "A-01"
      Y aplicar una propuesta que incluya "ARQ-101-A" se rechaza por estar fuera de su alcance

    Escenario: Confirmar el código de una unidad de otro programa es rechazado
      Dada la unidad "ARQ-101" marcada con código provisional
      Cuando el coordinador intenta confirmar el código "ARQ-101-X"
      Entonces el servidor responde 403
      Y la unidad "ARQ-101" sigue con código provisional

    Escenario: Un programa asignado por el administrador aplica sin volver a iniciar sesión
      Cuando el administrador asigna también el programa "PFG-ARQ" al coordinador
      Y el coordinador vuelve a consultar las asignaciones del período
      Entonces aparecen las asignaciones "ARQ-101-A" e "INF-101-A"
