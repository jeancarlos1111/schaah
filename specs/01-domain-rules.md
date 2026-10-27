# Spec 1: Reglas de Dominio y Normativa UBV (SAHAD)
**Sistema Automatizado para la Asignación de los Horarios Académicos de los Docentes**
**Universidad Bolivariana de Venezuela (UBV) — Eje Geopolítico Regional Kerepakupai Vena**

---

## 1. Marco Jurídico y Normativo de Referencia
Toda regla de asignación de carga horaria en el sistema debe derivar de:
1. **Ley de Universidades (1970)**: Artículos 81 al 85 (Dedicación y régimen profesoral).
2. **Documento Rector de la UBV (2003)**: Modelo pedagógico de interacción sociocomunitaria, Proyectos y unidades curriculares integradoras.
3. **Reglamento General de la UBV (2009)**: Estructura académica, Centros de Estudio y Coordinaciones de PFG.
4. **Reglamento del Personal Docente y de Investigación de la UBV**: Escalafón (Instructor, Asistente, Agregado, Asociado, Titular) y deberes docentes.
5. **Convención Colectiva Única del Sector Universitario (CCU)**: Parámetros de jornada laboral y bienestar del trabajador universitario.

---

## 2. Régimen de Dedicación Docente y Límites de Carga

En la UBV, la jornada semanal se desglosa en **Horas de Permanencia Total** y **Horas de Docencia Directa (Carga Lectiva)**.

| Régimen de Dedicación | Horas Semanales Permanencia | Horas Docencia Directa (Mín - Máx) | Horas Acompañamiento / Proyecto / Asesoría | Horas Investigación / Gestión / Preparación |
| :--- | :---: | :---: | :---: | :---: |
| **Dedicación Exclusiva (DE)** | 36 - 40 h | 12 - 16 h | 8 - 12 h | 12 - 16 h |
| **Tiempo Completo (TC)** | 30 - 36 h | 8 - 12 h | 6 - 10 h | 12 - 16 h |
| **Medio Tiempo (MT)** | 18 - 20 h | 4 - 8 h | 4 - 6 h | 6 - 8 h |
| **Tiempo Convencional (TV)** | 2 - 12 h | 2 - 12 h | 0 - 2 h | 0 - 2 h |

### Regla Mandatoria de Desglose
$$\text{Horas Permanencia} = \text{Docencia Directa} + \text{Horas Proyecto/Comunidad} + \text{Horas Asesoría} + \text{Horas Investigación/Gestión}$$

- **Docencia Directa**: Horas frente a aula (teoría/laboratorio).
- **Unidad Curricular Proyecto (P1, P2, P3, P4)**: Requiere horas de trabajo en comunidad/campo y horas de aula de acompañamiento. Las horas de campo **no** compiten por aulas físicas universitarias, pero **sí bloquean la disponibilidad horaria del docente**.
- Ningún docente en categoría ordinaria o contratada puede recibir una carga de docencia directa inferior al mínimo o superior al máximo de su dedicación, salvo autorización expresa de Consejo Universitario.

### Cómputo de la Carga Docente del Período
La carga de un docente en un período se calcula con `calcularCargaDocente(dedicacion, asignaciones)` (`src/core/domain/rules/dedicacionRules.ts`):
- **Horas por asignación** (`horasDocenciaSeccion`): las horas semanales declaradas en la oferta del período (`horasSemanalesOferta`) prevalecen; si no existen o son 0, se usan $H_T + H_P$ de la unidad curricular.
- **Estado normativo**: `EN_NORMA`, `DEFICIT` (bajo el mínimo, H-05), `SOBRECARGA` (sobre el máximo, H-04), `SIN_ASIGNAR` (0 horas) o `SIN_DEDICACION` (el docente no tiene dedicación registrada en el período y H-04 no puede evaluarse).
- **Horas disponibles**: $\max(0, \text{máximo} - \text{horas})$. Se muestran al asignar docente en `/periodos/:id/secciones` ("Quedaría en X h") y el botón Guardar se deshabilita si la asignación supera el tope H-04.
- La misma función alimenta el reporte de inconsistencias de la oferta (Spec 10).

### Dedicación Registrada desde la Oferta
Cuando el consolidado de oferta (Spec 10) trae para una misma cédula filas con dedicaciones distintas, se aplica la más frecuente y el conflicto queda registrado como **dedicación contradictoria** en la bitácora `importaciones_oferta`.

---

## 3. Estructura Académico-Territorial UBV

El sistema no modela un campus aislado, sino una red de sedes y aldeas:
1. **Ejes Territoriales**:
   - Ej.: Eje Geopolítico Territorial Kerepakupai Vena (Estado Bolívar / Amazonas).
2. **Sedes y Espacios**:
   - **Sede Física Propia**: Edificios con aulas convencionales, laboratorios de computación, talleres (ej. Sede UBV Bolívar - Ciudad Bolívar, Av. Germania).
   - **Aldea Universitaria / Espacio Municipalizado**: Espacios compartidos (escuelas, liceos) con horarios restringidos a turnos vespertino/nocturno o fin de semana.
   - **Espacio Comunitario**: Ámbitos de vinculación sociocomunitaria para unidades de Proyecto.
3. **Turnos de Operación**:
   - **Matutino**: 07:30 a 12:00
   - **Vespertino**: 12:30 a 17:00
   - **Nocturno**: 17:15 a 21:00
   - **Fin de Semana (Sábados/Domingos)**: 08:00 a 16:30 (Especial para Misión Sucre / Municipalización).
   - **Única**: Turno declarado así en la oferta para cohortes que no se rigen por los turnos anteriores.
4. **Programas y Cohortes**:
   - **Tipos de programa**: `PFG`, `PNF` y `PIU` se organizan por Trayecto/Tramo (RC-06, Spec 09); `PFA` (posgrado) e `IDIOMAS` se organizan por cohortes y pueden registrar unidades sin trayecto.
   - **Sección / Cohorte (`GrupoSeccion`)**: grupo de estudiantes de un PFG en un período, identificado por el código institucional de la oferta (ej. `KV BO-RC 01 A-M`), con sede, turno, malla (diurna/nocturna), estatus (apertura, continúa, cierra, finaliza) y matrícula. Su código se normaliza (`KV-BO-RC-01-A-M`) y es único por período y PFG.
   - **Asignación UC (`Seccion`)**: una unidad curricular con su docente dentro de una cohorte. Una cohorte cursa varias asignaciones en paralelo.

---

## 4. Catálogo Formal de Restricciones

### 4.1 Restricciones Duras (Hard Constraints - H)
Deben cumplirse en el 100% de los casos. Si no se cumplen, la asignación es inviable.

- **H-01 (No Solapamiento Docente)**: Un docente no puede tener dos asignaciones académicas (aula o campo) en el mismo intervalo de tiempo.
- **H-02 (No Solapamiento Aula)**: Un espacio físico no puede albergar más de una sección en el mismo intervalo de tiempo.
- **H-03 (No Solapamiento de Cohorte)**: Los estudiantes de una misma cohorte (`GrupoSeccion`) no pueden tener dos unidades curriculares programadas al mismo tiempo. La clave de cohorte es `claveCohorte()`: el grupo de la asignación (`G:<grupoId>`) o, si la asignación no pertenece a un grupo, la propia asignación (`S:<seccionId>`). Dos asignaciones de grupos distintos pueden coincidir en horario aunque compartan unidad curricular.
- **H-04 (Límite Máximo Docencia Directa)**: La suma total de horas lectivas semanales asignadas a un docente no debe superar el tope legal de su dedicación contractual.
- **H-05 (Límite Mínimo Docencia Directa)**: Si un docente está activo en el período, su carga no debe ser inferior al mínimo legal de su dedicación, salvo causal registrada (descarga sindical, permiso sabático, jefatura académica).
- **H-06 (Disponibilidad Docente Respetada)**: No se puede asignar ninguna clase en franjas donde el docente haya marcado indisponibilidad horaria justificada. En el solver, una sección con docente asignado solo se programa en las franjas que ese docente declaró disponibles en el período: si no declaró ninguna, la sección **no se programa** y el resultado es infactible (violación dura H-06 con el nombre de la sección y del docente); lo mismo si declaró menos franjas que los bloques que requiere la materia.
- **H-07 (Capacidad de Aula vs Matrícula)**: El aforo máximo del aula asignada debe ser mayor o igual a la matrícula proyectada de la sección.
- **H-08 (Adecuación de Tipo de Espacio)**:
  - Una materia teórica requiere aula convencional.
  - Una materia de laboratorio requiere laboratorio específico compatible.
  - Una materia de campo comunitario (`esProyectoComunitario`) no debe reservar aula física, pero sí consumir bloque temporal y la disponibilidad del docente. Se aplica en el validador (`validarH08AdecuacionEspacio`), al colocar o mover en la matriz (el aula indicada se descarta y el bloque se guarda con `espacio_fisico_id` nulo y tipo `PROYECTO_COMUNITARIO`), en ambos motores del solver (no se generan candidatos de aula) y en el evaluador (un bloque de proyecto con aula es violación dura H-08).
- **H-09 (Antiteletransportación de Sede)**: Si un docente tiene clases en dos sedes o aldeas distintas en el mismo día, debe existir una brecha mínima de traslado de al menos 90 minutos entre el fin de una y el inicio de la otra.
- **H-10 (Integridad de Bloque Curricular)**: Las unidades curriculares se dictan en bloques mínimos continuos de 90 minutos (2 horas académicas de 45 min) o 135 minutos (3 horas académicas). No se fraccionan en bloques aislados de 45 minutos.
- **H-13 (Reserva Institucional de los Martes)**: Los días martes de 10:45 AM a 12:15 PM (horas 5 y 6 de la jornada matutina) están reservados de forma obligatoria para reuniones de Dirección, PFG, PIU y Formación General. El solver y la asignación manual prohíben estrictamente programar actividades docentes en esta franja.
- **H-14 (Bloques Fijos Institucionales de Liderazgo)**: En todos los programas, Liderazgo I se programa fijamente los días jueves en el bloque 1 (07:30 AM - 09:00 AM) y Liderazgo II en el bloque 2 (09:05 AM - 10:35 AM), quedando libres las horas 5 y 6 de ese turno para otras actividades. Todo docente asignado a Liderazgo debe tener el día jueves acordado en su disponibilidad.
- **H-ACCESIBILIDAD-PISO (Restricción de Movilidad Docente por Nivel de Piso)**: Si un docente tiene prescripción de movilidad reducida o condición de salud con `pisoMaximo` asignado (ej. PB = 0, Piso 1 = 1), el sistema prohíbe programarlo en un espacio físico cuyo `pisoNivel` exceda dicho límite.
- **H-DIAS-DISPONIBILIDAD (Acuerdo de 3 Días Hábiles)**: Todo docente acuerda con su coordinación académica exactamente tres (3) días laborables específicos para concentrar su docencia. Se rechaza la asignación de secciones en días fuera del trío pactado.
- **PRIORIDAD-ADSCRIPCION (Programa de Adscripción del Docente)**: Todo docente pertenece contractualmente a un PFG (`pfgAdscripcionId`). Dicho programa tiene prioridad sobre sus horas de dedicación. En la asignación de secciones se muestran sus horas disponibles remanentes, bloqueando sobrecargas.

### 4.2 Restricciones Blandas (Soft Constraints - S)
Objetivos deseables que el motor de optimización maximiza o minimiza mediante penalizaciones ponderadas.

- **S-01 (Minimizar Huecos Docentes)**: Minimizar ventanas de tiempo vacías (horas muertas) entre clases de un docente en un mismo día (peso: 80).
- **S-02 (Preferencia Horaria del Docente)**: Asignar al docente en sus franjas prioritarias preferidas (peso: 60).
- **S-03 (Compactación por Sección/Estudiante)**: Agrupar las materias de una sección en días contiguos o en el mismo turno para evitar traslados innecesarios a los estudiantes (peso: 90).
- **S-04 (Distribución Equitativa de Carga)**: Distribuir las horas de los docentes de dedicación equivalente de manera balanceada en la semana (peso: 40).
- **S-05 (Concentración Semanal de Traslado)**: Procurar que un docente cumpla su docencia en 3 o 4 días como máximo, liberando días continuos para investigación, interacción comunitaria y permanencia institucional (peso: 70).
- **S-06 (Misma Aula para la Misma Sección)**: Mantener a una sección en la misma aula para materias consecutivas el mismo día (peso: 50).
- **S-07 (Respeto de Jornada Continua)**: Evitar jornadas docentes que excedan 6 horas académicas continuas de docencia directa al día (peso: 75).
- **S-08 (Uso Eficiente de Aulas Especiales)**: Maximizar la ocupación de laboratorios tecnológicos evitando utilizarlos para clases netamente teóricas (peso: 85).

---

## 5. Modelo de Disponibilidad Docente y Matriz Semanal

En SAHAD, la **Disponibilidad Docente** no representa una simple encuesta informal, sino el contrato temporal vinculante entre la jornada profesoral y el motor de optimización matemática CP-SAT:

### 5.1 Dualidad Normativo-Matemática
Cada slot semanal (intersección de día y bloque horario de 90 min) posee dos dimensiones:
1. **Dimensión Dura (Factibilidad - Regla H-06)**:
   - `disponible: false` (**NO / Indisponible**): Bloqueo absoluto. El solver tiene prohibido matemáticamente asignar horas lectivas al docente en esta franja. Protege descansos contractuales, jornadas en otra institución o descargas institucionales.
   - `disponible: true` (**Disponible**): Franja habilitada para albergar docencia directa.

2. **Dimensión Blanda (Preferencia y Calidad de Vida - Regla S-02)**:
   - Si una franja está habilitada, se pondera con una **Prioridad de Preferencia** ($p \in \{1, 2, 3\}$) que alimenta la función multiobjetivo con peso 60:
     - **P1 (Prioridad Alta - Verde)**: Franja óptima preferida por el profesor. El solver maximiza su uso.
     - **P2 (Prioridad Media - Azul)**: Franja aceptable. El solver la utiliza cuando existen colisiones de aula o de sección en P1.
     - **P3 (Prioridad Baja - Ámbar)**: Franja indeseada o de emergencia. El solver recibe penalización por usarla; solo la activa si no existe otra combinación factible.

### 5.2 Ciclo de Interacción en Matriz Visual
Cada celda de la matriz semanal responde a un ciclo de 4 estados con clic directo:
$$\text{Indisponible (Gris)} \xrightarrow{\text{clic}} \text{P1 (Verde)} \xrightarrow{\text{clic}} \text{P2 (Azul)} \xrightarrow{\text{clic}} \text{P3 (Ámbar)} \xrightarrow{\text{clic}} \text{Indisponible (Gris)}$$

### 5.3 Comportamiento de las Acciones Rápidas
Para evitar marcar individualmente las 48 celdas semanales (6 días $\times$ 8 bloques), la interfaz provee atajos masivos:
- **Marcar Todo Disponible (Alta)**: Pone la totalidad de la semana en `Disponible - P1`. Ideal para docentes con dedicación exclusiva sin restricciones externas.
- **Solo Turno Mañana**: Activa bloques 1 a 3 (07:30 a 12:15) en `P1` de Lunes a Sábado; apaga turnos vespertino y nocturno.
- **Solo Turno Tarde**: Activa bloques 4 a 6 (12:30 a 17:15) en `P1` de Lunes a Sábado; apaga turnos matutino y nocturno.
- **Limpiar Todo (No Disponible)**: Pone todas las celdas en `NO`. Permite empezar a marcar disponibilidad desde cero.

> [!NOTE]
> Las acciones rápidas solo alteran el estado reactivo del DOM en el navegador. La persistencia en la base de datos SQLite/PostgreSQL se consolida únicamente al presionar el botón **"Guardar Cambios"**.

---

## 6. Reglas de Validación de Sobrescritura y Ajustes Manuales
Cuando un Administrador o Planificador realiza una modificación manual vía UI (Drag & Drop):
1. El sistema **bloquea la operación** si viola las restricciones duras `H-01`, `H-02`, `H-03`, `H-06`, `H-07`, `H-08`, `H-09`, `H-11` o `H-12`. La validación se ejecuta al soltar (`validar-drop`) y se repite en el servidor al guardar (`mover` responde 409 con los conflictos), de modo que el cliente no puede omitirla.
2. Los roles `ADMINISTRADOR` y `PLANIFICADOR` son los únicos facultados para asignar espacios, mover bloques horarios y ejecutar el optimizador Solver. El `COORDINADOR_PFG` visualiza la matriz de horarios en modo solo lectura (`soloLectura: true`).
3. Si la modificación viola `H-04` o `H-05`, el sistema exige ingresar un motivo justificado (Resolución de Consejo de PFG) y registra el evento en auditoría.
4. Si la modificación degrada restricciones blandas (`S-01` a `S-08`), el sistema muestra el delta de penalización antes de confirmar el cambio.

---

## 7. Flujo del Ciclo de Vida de Oferta Académica

El período lectivo transita por un ciclo ordenado de estados de oferta:

$$\text{BORRADOR} \xrightarrow[\text{prerrequisitos}]{} \text{REGISTRO\_OFERTAS / PLANIFICACION} \longrightarrow \text{OFERTA\_APROBADA} \longrightarrow \text{ACTIVO / PUBLICADA} \longrightarrow \text{CERRADO}$$

1. **Borrador (`BORRADOR`)**: Período recién creado. No permite registrar ofertas ni asignar espacios.
2. **Apertura de Ventana de Oferta (`REGISTRO_OFERTAS` / `PLANIFICACION`)**:
   - **Prerrequisito de Apertura**: Requiere verificación previa de:
     - Al menos un docente activo en el sistema.
     - Al menos un aula o espacio físico activo.
     - Al menos una malla curricular o unidad curricular activa.
   - En este estado, los Coordinadores de PFG cargan secciones, definen matrícula y asignan docentes a las unidades de sus programas.
3. **Oferta Aprobada (`OFERTA_APROBADA`)**:
   - La ventana de registro de oferta se bloquea para coordinadores (modo solo lectura para secciones).
   - El equipo de Planificación y Administración procede a la corrida del Solver y asignación de aulas/espacios físicos.
4. **Período Activo / Publicado (`ACTIVO` / `PUBLICADA`)**:
   - Los horarios oficiales quedan publicados y vigentes.
5. **Período Cerrado (`CERRADO`)**:
   - Período culminado, histórico inmutable.
