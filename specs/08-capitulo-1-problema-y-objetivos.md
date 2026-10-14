# Capítulo I: Contexto y Formulación del Proyecto

**Sistema Automatizado para la Asignación de los Horarios Académicos de los Docentes de la Universidad Bolivariana de Venezuela Eje Geopolítico Regional Kerepakupai Vena (SAHAD)**  
**Universidad Bolivariana de Venezuela (UBV) — Eje Geopolítico Regional Kerepakupai Vena**

---

## 1.1 Planteamiento del Problema

La gestión y asignación de carga académica horaria en instituciones universitarias constituye un problema clásico y complejo dentro de la optimización combinatoria y la investigación de operaciones, catalogado formalmente como un Problema de Confección de Horarios Universitarios (*University Course Timetabling Problem*, UCTP), de naturaleza NP-duro (*Non-Deterministic Polynomial-Time Hard*). Dicha complejidad se incrementa exponencialmente en entornos de educación universitaria pública con estructuras territoriales desconcentradas y modelos pedagógicos no convencionales.

En la Universidad Bolivariana de Venezuela (UBV), la planificación académica presenta características de alta complejidad estructural y territorial:
1. **Modelo sociocomunitario y curricular específico**: Conforme al Documento Rector de la UBV (2003), los Programas de Formación de Grado (PFG) articulan unidades curriculares teóricas, laboratorios tecnológicos y unidades integradoras de Proyecto Comunitario (P1 a P4). Las unidades de Proyecto exigen horas de interacción comunitaria en campo que consumen disponibilidad docente pero no ocupan aulas físicas universitarias, demandando un tratamiento diferenciado frente a la docencia directa tradicional.
2. **Dispersión territorial y multimodalidad**: La UBV opera bajo un esquema de Ejes Geopolíticos Territoriales, siendo el caso de estudio representativo el **Eje Geopolítico Regional Kerepakupai Vena (Estado Bolívar)**. Este integra la **Sede UBV Bolívar - Ciudad Bolívar** (Av. Germania, Municipio Angostura del Orinoco) con infraestructura física fija propia, junto a una red de aldeas universitarias y espacios municipalizados (tales como la Aldea Caroní en Puerto Ordaz, Aldea Upata en Piar o Aldea Ciudad Piar en Bolivariano Angostura) sujetos a franjas vespertinas, nocturnas y fines de semana de Misión Sucre, además de ámbitos comunitarios.
3. **Marco legal de dedicación laboral**: La Ley de Universidades (1970, arts. 81-85) y la Convención Colectiva Única del Sector Universitario (CCU) establecen límites taxativos de permanencia y docencia directa según el régimen docente: Dedicación Exclusiva (DE: 12-16 h lectivas), Tiempo Completo (TC: 8-12 h lectivas), Medio Tiempo (MT: 4-8 h lectivas) y Tiempo Convencional (TV: 2-12 h lectivas).

En la actualidad, la asignación horaria y de carga lectiva en la UBV se ejecuta de forma manual, descentralizada y fragmentada por cada coordinación de PFG y centro de estudio, principalmente mediante hojas de cálculo independientes o minutas impresas. Esta dinámica genera severas deficiencias:
- **Violación recurrente de límites de dedicación**: Se registran docentes con sobrecarga lectiva que vulnera topes legales de la CCU o, por el contrario, docentes subasignados por debajo del mínimo legal correspondiente a su dedicación contractual.
- **Conflictos temporales y espaciales**: Ocurrencia sistemática de solapamientos donde un mismo docente o una misma sección estudiantil es convocada a dos actividades simultáneas, o colisiones de dos asignaturas sobre un mismo espacio físico.
- **Fenómeno de teletransportación territorial**: Asignación de bloques contiguos a un docente en sedes o aldeas distantes entre sí, sin considerar el tiempo mínimo de traslado físico intersede (estimado en al menos 90 minutos), obligando a ausencias forzadas o retrasos crónicos.
- **Incompatibilidad y subutilización de espacios**: Asignación de asignaturas con matrículas superiores al aforo físico de aulas disponibles, o asignación de clases puramente teóricas en laboratorios especializados, restando cupos a unidades con requerimientos computacionales.
- **Dispersión de la jornada docente y estudiantil**: Generación de extensas franjas desocupadas intermedias ("horas muertas" o huecos) en un mismo día, afectando la calidad de vida profesoral, la retención estudiantil y desaprovechando las franjas de preferencia y disponibilidad vinculante declaradas por el profesorado.
- **Desarticulación curricular y distorsión de planes de estudio**: Inexistencia de un catálogo centralizado y validado de mallas curriculares por PFG, propiciando la apertura anómala de secciones con asignaturas cruzadas ajenas a la carrera en curso (ej. estudiantes de Informática asignados arbitrariamente a unidades curriculares de Agroecología o Gestión Ambiental), así como la alteración empírica de las horas lectivas semanales ($H_T, H_P, H_C$) frente a los diseños curriculares aprobados por el Consejo Nacional de Universidades (CNU), desvirtuando los créditos académicos y el perfil de egreso.
- **Ineficiencia administrativa**: La resolución manual del cronograma insume semanas de trabajo intensivo en cada inicio de período lectivo, produciendo retrasos en la oferta académica y una alta tasa de reprocesos ante reclamos justificados.

### Formulación del Problema

¿De qué manera el desarrollo de un sistema automatizado para la asignación de los horarios académicos de los docentes en la Universidad Bolivariana de Venezuela Eje Geopolítico Regional Kerepakupai Vena permitirá optimizar la distribución de la carga horaria y el uso adecuado de los espacios institucionales, erradicando solapamientos y garantizando la fidelidad de las mallas curriculares y el régimen laboral docente?

---

## 1.2 Objetivos de la Investigación

### 1.2.1 Objetivo General

Desarrollar un sistema automatizado para la asignación de los horarios académicos de los docentes en la Universidad Bolivariana de Venezuela Eje Geopolítico Regional Kerepakupai Vena con el fin de optimizar la distribución de la carga horaria y el uso adecuado de los espacios institucionales.

---

## 1.3 Objetivos Específicos

1. **Diagnosticar** la situación actual en los procesos de asignación de carga horaria docente y la disponibilidad y uso de los espacios institucionales (aulas, laboratorios, sedes y aldeas universitarias) en la Universidad Bolivariana de Venezuela Eje Geopolítico Regional Kerepakupai Vena.
2. **Formular** el modelo matemático y computacional de asignación de horarios basado en restricciones duras y blandas, considerando las normativas laborales de dedicación profesoral, los diseños curriculares y los requerimientos de aforo e infraestructura espacial institucional.
3. **Diseñar e implementar** la arquitectura del sistema automatizado y los módulos web administrativos (Node.js, Express, TypeScript, Prisma ORM, PostgreSQL, EJS) para la gestión de mallas curriculares, disponibilidad profesoral, oferta académica y control de espacios físicos institucionales.
4. **Construir** el motor algorítmico de asignación automatizada y la interfaz interactiva de matriz de horarios que permita generar, visualizar y ajustar de manera asistida las planificaciones académicas sin conflictos.
5. **Validar** la efectividad y el desempeño del sistema automatizado en la optimización de la distribución de la carga horaria docente y el uso adecuado de los espacios institucionales mediante pruebas funcionales, pruebas de carga y escenarios de aceptación basados en datos reales de la institución.

---

## 1.4 Justificación

### 1.4.1 Justificación Teórica y Metodológica
El proyecto aplica principios de la Investigación de Operaciones, la Inteligencia Artificial Simbólica y la Programación por Restricciones (*Constraint Programming* con Solvers CP-SAT) a la resolución del problema UCTP en un entorno sociopedagógico específico. Aporta un modelo matemático formal que compatibiliza la dualidad entre docencia directa en aula y docencia en campo comunitario (Proyecto UBV), sirviendo como referencia metodológica para la automatización de horarios en universidades municipalizadas y de corte sociocrítico en América Latina.

### 1.4.2 Justificación Técnica
La implementación de SAHAD moderniza la gestión tecnológica universitaria reemplazando herramientas ofimáticas aisladas por una arquitectura robusta:
- Tipado estático de extremo a extremo mediante TypeScript.
- Persistencia formal y migraciones reproducibles con Prisma ORM sobre PostgreSQL/SQLite WAL.
- Módulo web de mallas curriculares con integridad relacional estricta, impidiendo la asignación cruzada de materias incompatibles y garantizando que los bloques de horario calculados coincidan exactamente con las horas teóricas y prácticas oficiales.
- Desacoplamiento de la computación pesada NP-dura mediante workers especializados en Node.js con Google OR-Tools compilado a WebAssembly (`@google/ortools`), previniendo el bloqueo del event loop sin dependencias de entornos externos.
- Interfaz reactiva y accesible vía SSR con HTMX y UIkit 3, minimizando la sobrecarga de red y garantizando rendimiento en conexiones institucionales estándar.

### 1.4.3 Justificación Social y Laboral
SAHAD promueve la humanización de las condiciones laborales del personal docente de la UBV:
- Garantiza la observancia de la Convención Colectiva Única (CCU) y la Ley de Universidades, evitando la sobreexplotación por exceso de horas lectivas o la precarización por subasignación.
- Protege los períodos de descanso e indisponibilidad debidamente justificados.
- Erradica los traslados geográficos imposibles entre sedes lejanas (restricción de antiteletransportación de al menos 90 min).
- Compacta la jornada estudiantil en días contiguos y turnos homogéneos, reduciendo el gasto de transporte y favoreciendo la permanencia y prosecución de la masa estudiantil.

### 1.4.4 Justificación Institucional y Curricular
A nivel de gobernanza académica y rendición de cuentas:
- Garantiza la fidelidad curricular de las carreras ante el CNU y el Documento Rector UBV, evitando distorsiones en las cargas horarias y en los perfiles de egreso.
- Proporciona a la Dirección General Académica y a los Consejos de PFG trazabilidad total y auditoría sobre cada asignación horaria.
- Optimiza el uso de la infraestructura física del Estado, maximizando la ocupación de aulas y laboratorios tecnológicos según los requerimientos pedagógicos de cada materia.
- Reduce el ciclo de planificación de horarios de 3-4 semanas a minutos de ejecución computacional, permitiendo arrancar los períodos académicos con cronogramas estables y sin retrasos.

---

## 1.5 Alcance y Delimitación

### 1.5.1 Alcance Funcional
El sistema contempla:
- **Gestión Curricular y Mallas de Formación**: Módulo web para parametrización y administración integral de Programas de Formación de Grado (PFG), catalogación de mallas organizadas jerárquicamente en Trayectos (1 a 4) y Tramos (1 y 2), registro analítico de Unidades Curriculares con tipificación de horas semanales (teóricas $H_T$, prácticas $H_P$, campo comunitario $H_C$), unidades de crédito, tipología requerida de espacio físico (aulas teóricas, laboratorios de informática, laboratorios científicos, auditorios, campo comunitario) y delimitación del eje transversal de Proyecto Comunitario. Validación restrictiva en la apertura de secciones para impedir asignaciones curriculares cruzadas o incompatibles.
- **Infraestructura Territorial**: Parametrización de ejes territoriales, sedes físicas, aldeas universitarias, espacios comunitarios y catálogo de recintos con aforos y tipos.
- **Régimen Docente**: Registro y clasificación del personal académico bajo dedicaciones legales (Dedicación Exclusiva, Tiempo Completo, Medio Tiempo, Tiempo Convencional).
- **Matriz de Disponibilidad**: Captura semanal de indisponibilidad justificada (bloqueos duros) y preferencias docentes cualificadas (P1 prioridad alta, P2 prioridad media, P3 franja evitable).
- **Catálogo de Restricciones del Solver**:
  - *Restricciones Duras (`H-01` a `H-10`)*: No solapamiento de docente, aula ni sección; límites de docencia directa mínima y máxima por dedicación; disponibilidad obligatoria; adecuación de espacio y aforo; brecha mínima de traslado de 90 min entre sedes distintas; e integridad de bloques continuos de 90 o 135 minutos.
  - *Restricciones Blandas (`S-01` a `S-08`)*: Minimización de ventanas huecas, maximización de franjas preferidas, compactación de materias por sección, balance semanal de carga, concentración de días de docencia directa y uso eficiente de laboratorios.
- **Entorno Interactivo**: Tableros visuales de horarios semanales por docente, sección y aula; soporte para ajustes manuales drag-and-drop con validación reactiva en tiempo real; y reportes de consolidación de carga horaria.
- **Seguridad**: Control de acceso granular RBAC con roles de `ADMINISTRADOR`, `DIRECTOR_ACADEMICO`, `COORDINADOR_PFG` y `DOCENTE`.

### 1.5.2 Delimitación Territorial y Poblacional
La investigación y despliegue del sistema se delimita a la oferta académica impartida en el **Eje Geopolítico Regional Kerepakupai Vena (Estado Bolívar)** de la Universidad Bolivariana de Venezuela, abarcando la **Sede UBV Bolívar - Ciudad Bolívar (Municipio Angostura del Orinoco)**, así como las aldeas universitarias y espacios municipalizados vinculados a los Programas de Formación de Grado activos durante el período lectivo (ej. Aldea Caroní en Puerto Ordaz, Aldea Upata en Piar y Aldea Ciudad Piar en Bolivariano Angostura, entre otras).

### 1.5.3 Limitaciones y Exclusiones
- **Exclusión de Nómina Financiera**: El sistema no procesa cálculos salariales, pagos o deducciones de nómina; únicamente consolida las horas lectivas y de permanencia certificadas para uso académico-administrativo.
- **Sistemas de Control de Estudios Externos**: SAHAD no reemplaza el sistema de registro e inscripción estudiantil (SUR@UBV); actúa como módulo planificador de oferta de horarios y asignaciones, cuyos resultados pueden ser consumidos por SUR@UBV o exportados.
- **Capacidad de Cómputo del Worker**: El rendimiento del algoritmo de optimización depende de la asignación de memoria y CPU del servidor para instancias con alto volumen de secciones y restricciones simultáneas, estableciéndose tiempos de corte (*timeout*) configurables para garantizar soluciones factibles de alta calidad.

---

## 1.6 Descripción del Área de Investigación

### 1.6.1 Identificación y Dependencia Institucional
La investigación se desarrolla en el marco institucional de la **Universidad Bolivariana de Venezuela (UBV)**, institución de educación universitaria pública creada mediante Decreto Presidencial N° 2.517 de fecha 18 de julio de 2003, adscrita al Ministerio del Poder Popular para la Educación Universitaria (MPPEU).

### 1.6.2 Misión, Visión y Contexto del Modelo UBV
- **Misión**: Formar profesionales integrales, con sensibilidad social, visión crítica y compromiso ético-político con la transformación comunitaria del país, a través del desarrollo de programas académicos vinculados directamente con los problemas socioeconómicos y territoriales de la nación.
- **Visión**: Constituirse en la universidad del pueblo venezolano, abierta, popular y comunitaria, líder en la generación de conocimiento emancipador, la investigación sociocrítica y la democratización del acceso a la educación superior en todo el territorio nacional.

### 1.6.3 Estructura Organizativa y Ámbito de Operación
El área operativa directamente intervenida está conformada por:
1. **Vicerrectorado Académico y Dirección General Académica**: Instancia responsable de velar por el cumplimiento de las políticas docentes, los planes de estudio y la observancia del régimen profesoral en todas las sedes.
2. **Centros de Estudios**: Unidades académicas interdisciplinarias que agrupan líneas de investigación y áreas del conocimiento.
3. **Coordinaciones de Programas de Formación de Grado (PFG)**: Responsables operativas directas de la planificación curricular, apertura de secciones, asignación de carga profesoral a las unidades curriculares y fiscalización de horarios (ej. Informática para la Gestión Social, Comunicación Social, Estudios Jurídicos, Gestión Ambiental, entre otros).
4. **Coordinación de Eje Geopolítico Regional Kerepakupai Vena (Sede Bolívar)**: Instancia de articulación regional encargada de la supervisión de la Sede UBV Bolívar en Ciudad Bolívar, las aldeas universitarias municipalizadas (Caroní, Piar, Cedeño, Gran Sabana, Bolivariano Angostura) y convenios institucionales en el estado Bolívar.

### 1.6.4 Dinámica Operativa de Turnos y Espacios
El área de investigación opera bajo una estructura temporal y física heterogénea:
- **Turnos de Operación**:
  - Matutino: 07:30 a 12:00
  - Vespertino: 12:30 a 17:00
  - Nocturno: 17:15 a 21:00
  - Fin de Semana: 08:00 a 16:30 (modalidad municipalizada / Misión Sucre)
- **Tipología de Infraestructura**:
  - Sede física propia: Sede UBV Bolívar (Av. Germania, Ciudad Bolívar), dotada de aulas de clase magistral, salas de conferencias y laboratorios de informática.
  - Aldeas universitarias municipalizadas: Espacios educativos compartidos en Puerto Ordaz, Upata, Caicara del Orinoco y Ciudad Piar para turnos vespertinos y fines de semana.
  - Espacios sociocomunitarios en consejos comunales y comunas del estado Bolívar donde se ejecutan los proyectos formativos (P1 a P4) sin asignación de aula física pero con presencia docente obligatoria.
