# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Planificador Académico (`PLANIFICADOR` / `DIRECTOR_ACADEMICO`):** Responsable de abrir períodos lectivos, importar y exportar el consolidado institucional de oferta (`.xlsx` de 29 columnas), ejecutar el motor de optimización CP-SAT, realizar ajustes manuales asistidos (Drag & Drop con validación en tiempo real) y aprobar/publicar horarios sin conflictos.
- **Coordinador de PFG (`COORDINADOR_PFG`):** Gestiona mallas curriculares, cohortes, secciones, matrículas y asignación de docentes dentro de sus programas de formación asignados (`UsuarioPrograma`); registra disponibilidad de docentes de su programa con motivo auditable y consulta la matriz de horarios en modo lectura.
- **Docente (`DOCENTE`):** Declara su disponibilidad y preferencias horarias por período y consulta su horario personal publicado y el consolidado normativo desde escritorio o dispositivo móvil.
- **Administrador (`ADMINISTRADOR`):** Gestiona cuentas de usuario, roles RBAC, vinculación de programas por coordinador, activación/desactivación de registros maestros y consulta la bitácora de auditoría global.

## Product Purpose

Sistema Automatizado para la Asignación de los Horarios Académicos de los Docentes (SAHAD) de la Universidad Bolivariana de Venezuela (UBV) — Eje Geopolítico Regional Kerepakupai Vena. Automatiza y audita la planificación académica universitaria para erradicar solapamientos docentes, estudiantiles y de aula, garantizar el cumplimiento estricto de los límites legales de dedicación laboral y mallas curriculares aprobadas por el CNU, y reducir el ciclo de programación de semanas a minutos.

## Positioning

Resuelve el Problema de Confección de Horarios Universitarios (UCTP) específico del modelo sociocomunitario y territorial desconcentrado de la UBV mediante programación por restricciones (`Google OR-Tools CP-SAT` en WebAssembly dentro de `worker_threads`), combinando en un único motor y flujo auditable:
- Régimen legal venezolano de dedicación docente (CCU / Ley de Universidades: DE 12–16h, TC 8–12h, MT 4–8h, TV 2–12h) e hitos institucionales (`H-01` a `H-14`, `S-01` a `S-08`).
- Separación entre docencia directa en aula/laboratorio y horas de interacción sociocomunitaria en campo (Proyecto Comunitario P1–P4) que consumen carga docente sin ocupar aula física.
- Restricción de antiteletransportación territorial (mínimo 90 minutos de traslado entre sedes y aldeas universitarias del Estado Bolívar).
- Interoperabilidad directa con el consolidado institucional de oferta académica en formato `.xlsx` de 29 columnas.

## Operating Context

- **Entorno institucional:** Sede UBV Ciudad Bolívar (Av. Germania) y red de aldeas universitarias y espacios municipalizados del Eje Geopolítico Regional Kerepakupai Vena (Aldea Caroní, Upata, Ciudad Piar, entre otras), abarcando turnos matutinos, vespertinos, nocturnos y fines de semana.
- **Artefactos y rituales operativos:** Importación/exportación de hojas de cálculo institucionales `.xlsx` (29 columnas) con vista previa y detección de inconsistencias, confirmación de códigos provisionales de unidades curriculares, matriz interactiva semanal en bloques de 45 minutos, reportes PDF/Excel y auditoría transaccional de cambios de disponibilidad y ajustes manuales.
- **Uso por dispositivo:** Operación intensiva de alta densidad en escritorio para planificación, gestión de mallas y tableros de datos; consulta ágil en escritorio y móvil para docentes.

## Capabilities and Constraints

- **Stack en producción:** Node.js 22+, Express, TypeScript, SSR con EJS (`express-ejs-layouts`) + HTMX, UIkit 3, Prisma ORM sobre SQLite WAL (desarrollo) / PostgreSQL (producción) y `or-tools-wasm`.
- **Formato horario civil obligatorio:** Todas las vistas de horarios, matrices, historiales y disponibilidades deben mostrarse en formato civil venezolano de 12 horas con `AM/PM`.
- **Tablas y paginación en servidor (`SahadDataTable` — Spec 07):** Prohibido cargar colecciones completas en el DOM del cliente. Búsqueda, filtrado, ordenamiento y paginación se ejecutan en servidor (`skip`/`take` en Prisma) con actualización reactiva vía HTMX (`hx-get`, `hx-target`, `hx-select`, `hx-push-url`) y métricas globales desacopladas.
- **Controles y acciones explícitas (`AGENTS.md`):**
  - Cero controles sin estilo; todos los componentes deben estar respaldados por reglas en `src/public/css/style.css`.
  - Todo botón de acción en tablas debe incluir ícono semántico (`<span uk-icon="..."></span>`) y etiqueta de texto visible (`<span>Texto</span>`) dentro de `.table-actions-cell` / `.table-actions-group` alineado a la derecha; prohibidos botones de solo ícono o cápsulas vacías.
  - Menús desplegables estilizados con `.clean-dropdown` y `.dropdown-action-btn`.
- **Alcance y seguridad por rol (Spec 06):** Filtrado estricto en servidor por `UsuarioPrograma` para coordinadores; motivo obligatorio (mínimo 10 caracteres) y registro en `AuditoriaDisponibilidad` cuando un tercero autorizado modifica la disponibilidad de un docente.

## Brand Commitments

- **Identidad institucional:** SAHAD UBV — Universidad Bolivariana de Venezuela, Eje Geopolítico Regional Kerepakupai Vena.
- **Activos oficiales existentes:** Logotipo institucional en `/img/logo-ubv.png` y favicons en `/favicon.png`, `/favicon.ico` y `/favicon.svg`.
- **Voz y tono:** Institucional, técnico, preciso y formal en español venezolano (nomenclatura oficial UBV: PFG, PNF, PIU, PFA, Trayecto, Tramo, Unidad Curricular, Dedicación DE/TC/MT/TV, Aldea Universitaria, Cohorte).
- **Soporte dual de tema:** Tema oscuro por defecto (`data-theme="dark"`) y tema claro con persistencia en `localStorage` (`sahad-theme`).

## Evidence on Hand

- Especificaciones formales completas en `specs/` (`00` a `10`: arquitectura, reglas de dominio `H-01`..`H-14` y `S-01`..`S-08`, esquema Prisma/SQL, formulación CP-SAT, rutas SSR/HTMX, escenarios BDD Gherkin, RBAC, `SahadDataTable`, planteamiento del problema, mallas curriculares y oferta `.xlsx`).
- Semillas y datos reales/demostrativos de espacios, mallas y oferta en `src/scripts/` (`seedAdmin.ts`, `seedEspacios.ts`, `seedOferta.ts`, `seedDemoManual.ts`).
- Suite de pruebas unitarias, de dominio y de aceptación BDD en `tests/` ejecutables con `pnpm test` y `pnpm test:acceptance`.

## Product Principles

1. **Rigor normativo antes que conveniencia visual:** Ninguna interacción de interfaz puede ocultar, omitir ni relajar las restricciones legales de dedicación docente, prelaciones curriculares, alcance por PFG ni trazabilidad de auditoría.
2. **Densidad operativa clara y sin ambigüedad:** En pantallas de planificación y tablas maestras, cada acción, estado de conflicto, bloque horario (en formato 12h AM/PM) y métrica debe leerse sin depender de íconos mudos ni tooltips ocultos.
3. **Rendimiento institucional en servidor:** Mantener respuestas rápidas y predecibles mediante SSR + HTMX y paginación en base de datos, evitando sobrecargar el navegador del usuario en equipos o redes institucionales.
4. **Fidelidad territorial y curricular:** Tratar como ciudadanos de primera clase las particularidades de la UBV (Proyecto Comunitario en campo, traslados intersede en el Eje Kerepakupai Vena y códigos provisionales del consolidado `.xlsx`).

## Accessibility & Inclusion

- Soporte completo para operación intensiva en escritorio (alta densidad de datos) y consulta adaptable en dispositivos móviles para docentes.
- Contraste legible garantizado en ambos temas (`dark` y `light`), etiquetas textuales explícitas acompañando cada ícono de acción y retroalimentación clara de errores y conflictos normativos.

