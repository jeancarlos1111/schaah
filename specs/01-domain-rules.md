# Spec 1: Reglas de Dominio y Normativa UBV (SCHAAH)
**Sistema de Carga Horaria y Asignación Automática de Horarios**
**Universidad Bolivariana de Venezuela (UBV)**

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

---

## 4. Catálogo Formal de Restricciones

### 4.1 Restricciones Duras (Hard Constraints - H)
Deben cumplirse en el 100% de los casos. Si no se cumplen, la asignación es inviable.

- **H-01 (No Solapamiento Docente)**: Un docente no puede tener dos asignaciones académicas (aula o campo) en el mismo intervalo de tiempo.
- **H-02 (No Solapamiento Aula)**: Un espacio físico no puede albergar más de una sección en el mismo intervalo de tiempo.
- **H-03 (No Solapamiento Sección)**: Los estudiantes de una sección no pueden tener dos unidades curriculares programadas al mismo tiempo.
- **H-04 (Límite Máximo Docencia Directa)**: La suma total de horas lectivas semanales asignadas a un docente no debe superar el tope legal de su dedicación contractual.
- **H-05 (Límite Mínimo Docencia Directa)**: Si un docente está activo en el período, su carga no debe ser inferior al mínimo legal de su dedicación, salvo causal registrada (descarga sindical, permiso sabático, jefatura académica).
- **H-06 (Disponibilidad Docente Respetada)**: No se puede asignar ninguna clase en franjas donde el docente haya marcado indisponibilidad horaria justificada.
- **H-07 (Capacidad de Aula vs Matrícula)**: El aforo máximo del aula asignada debe ser mayor o igual a la matrícula proyectada de la sección.
- **H-08 (Adecuación de Tipo de Espacio)**:
  - Una materia teórica requiere aula convencional.
  - Una materia de laboratorio requiere laboratorio específico compatible.
  - Una materia de campo comunitario no debe reservar aula física, pero sí consumir bloque temporal.
- **H-09 (Antiteletransportación de Sede)**: Si un docente tiene clases en dos sedes o aldeas distintas en el mismo día, debe existir una brecha mínima de traslado de al menos 90 minutos entre el fin de una y el inicio de la otra.
- **H-10 (Integridad de Bloque Curricular)**: Las unidades curriculares se dictan en bloques mínimos continuos de 90 minutos (2 horas académicas de 45 min) o 135 minutos (3 horas académicas). No se fraccionan en bloques aislados de 45 minutos.

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

En SCHAAH, la **Disponibilidad Docente** no representa una simple encuesta informal, sino el contrato temporal vinculante entre la jornada profesoral y el motor de optimización matemática CP-SAT:

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
Cuando un Coordinador Académico realiza una modificación manual vía UI (Drag & Drop):
1. El sistema **bloquea la operación** si viola las restricciones duras `H-01`, `H-02`, `H-03` o `H-09`.
2. Si la modificación viola `H-04` o `H-05`, el sistema exige ingresar un motivo justificado (Resolución de Consejo de PFG) y registra el evento en auditoría.
3. Si la modificación degrada restricciones blandas (`S-01` a `S-08`), el sistema muestra el delta de penalización antes de confirmar el cambio.
