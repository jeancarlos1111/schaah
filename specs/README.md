# SAHAD - Sistema Automatizado para la Asignación de los Horarios Académicos de los Docentes de la Universidad Bolivariana de Venezuela Eje Geopolítico Regional Kerepakupai Vena
## Especificaciones de Desarrollo (Spec-Driven Development)

**Stack Oficial**: Node.js + pnpm + Express + TypeScript + SSR (EJS + HTMX) + UIkit 3 + Prisma ORM + SQLite WAL (Dev) / PostgreSQL (Prod) + Worker CP-SAT.

---

## 🗂️ Índice Maestro de Especificaciones

| Archivo | Tipo | Resumen Técnico |
| :--- | :--- | :--- |
| [`00-architecture-tech-stack.md`](./00-architecture-tech-stack.md) | **Arquitectura & Stack** | Especificación de Express + TypeScript, SSR con EJS/HTMX, Prisma ORM, PostgreSQL y Worker desacoplado de optimización. |
| [`01-domain-rules.md`](./01-domain-rules.md) | **Dominio & Normativa UBV** | Ley de Universidades, Documento Rector UBV, dedicaciones (DE, TC, MT, TV) y cómputo de carga del período, tipos de programa y cohortes, horas de campo/comunidad sin aula fija, catálogo de restricciones duras (`H-01` a `H-10`, con `H-03` por cohorte) y blandas (`S-01` a `S-08`). |
| [`02-orm-schema.prisma`](./02-orm-schema.prisma) | **ORM & Modelado TypeScript** | Esquema Prisma completo con tipos ENUM, modelos relacionales, soporte de auditoría de ajustes y tipos estáticos exportables a TypeScript. |
| [`02-database-schema.sql`](./02-database-schema.sql) | **DDL Nativo PostgreSQL** | Esquema SQL físico con extensiones `btree_gist`, exclusión temporal `EXCLUDE USING gist` y vista de consolidación de carga docente. |
| [`03-solver-formulation.md`](./03-solver-formulation.md) | **Formulación Matemática Solver** | Variables de decisión discretas (slots de 45 min), ecuaciones de restricciones duras, función multiobjetivo y flujo de ejecución con Google OR-Tools CP-SAT. |
| [`04-routes-and-views-spec.md`](./04-routes-and-views-spec.md) | **Rutas Express & Vistas SSR** | Enrutamiento de Express, controladores TypeScript, plantillas EJS y endpoints reactivos HTMX para validación en tiempo real de Drag & Drop. |
| [`04-openapi-spec.yaml`](./04-openapi-spec.yaml) | **Contratos REST Auxiliares** | Especificación OpenAPI 3.1 para jobs de optimización, integración con SUR@UBV y exportaciones externas. |
| [`05-acceptance-tests.feature`](./05-acceptance-tests.feature) | **Pruebas de Aceptación (BDD)** | Escenarios Gherkin en español agrupados en 8 `Regla:` (dedicación, solapamiento, traslado, proyecto comunitario, auditoría, mallas, oferta y alcance del coordinador). Se ejecutan con `pnpm test:acceptance` (`@amiceli/vitest-cucumber`, pasos en `tests/acceptance/`). |
| [`06-auth-roles-permissions.md`](./06-auth-roles-permissions.md) | **Autenticación & RBAC** | Matriz de roles (`ADMINISTRADOR`, `DIRECTOR_ACADEMICO`, `COORDINADOR_PFG`, `DOCENTE`), sesiones con cookies, protección de endpoints y alcance del coordinador por programa (`UsuarioPrograma`). |
| [`07-ui-components-spec.md`](./07-ui-components-spec.md) | **Componentes de UI (Frontend)** | Especificación del componente reutilizable `SahadDataTable` con búsqueda, filtros cruzados, paginación y ordenamiento. |
| [`08-capitulo-1-problema-y-objetivos.md`](./08-capitulo-1-problema-y-objetivos.md) | **Marco Metodológico (Capítulo I)** | Planteamiento del problema (UCTP NP-duro en UBV), objetivos generales/específicos, justificación (teórica, técnica, social e institucional), alcance y área de investigación. |
| [`09-mallas-curriculares-spec.md`](./09-mallas-curriculares-spec.md) | **Mallas Curriculares & PFG** | Gestión web de programas (PFG, PNF, PIU, PFA, IDIOMAS), unidades curriculares por trayecto/tramo (RC-06, trayectos 0–5) o sin ubicación en PFA/IDIOMAS, prelaciones RC-07, códigos provisionales, desglose horario ($H_T, H_P, H_C$) y tipología de espacios requeridos. |
| [`10-oferta-carga-horaria-spec.md`](./10-oferta-carga-horaria-spec.md) | **Oferta de Carga Horaria & Cohortes** | Importación con vista previa del consolidado `.xlsx` de 29 columnas, cohortes (`GrupoSeccion`) y asignaciones UC, exportación institucional, reporte de inconsistencias, asignación de docentes con horas disponibles y respaldos de la base. |


---

## 🛠️ Ciclo de Ejecución

1. **Persistencia**: Inicializar Prisma con `specs/02-orm-schema.prisma` y aplicar extensiones de `specs/02-database-schema.sql`.
2. **Core Domain & Servicios**: Desarrollar lógica de validación de restricciones en TypeScript (`H-01` a `H-10`) en `src/core/domain`.
3. **Controladores y Vistas SSR**: Construir vistas EJS y rutas Express siguiendo `specs/04-routes-and-views-spec.md`.
4. **Worker Solver**: Integrar el script de optimización CP-SAT en `worker/` respetando `specs/03-solver-formulation.md`.
5. **Testing Progresivo y Real (BDD / Vitest)**:
   - Toda funcionalidad o servicio debe validarse con pruebas reales en Vitest (`pnpm test`).
   - Los escenarios BDD de [`05-acceptance-tests.feature`](./05-acceptance-tests.feature) se ejecutan tal cual: cada `Regla:` tiene su archivo `tests/acceptance/<regla>.steps.test.ts` y el runner falla si un escenario no tiene implementación o si un paso no coincide con el texto del `.feature`.
   - **Regla Anti-Bypass**: Prohibidas pruebas vacías, asserciones superficiales, mocks de la lógica de dominio o saltos de test (`test.skip`). Las pruebas deben ejercer la lógica real del sistema.
