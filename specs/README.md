# SCHAAH - Sistema de Carga Horaria y Asignación Automática de Horarios (UBV)
## Especificaciones de Desarrollo (Spec-Driven Development)

**Stack Oficial**: Node.js + pnpm + Express + TypeScript + SSR (EJS + HTMX) + UIkit 3 + Prisma ORM + SQLite WAL (Dev) / PostgreSQL (Prod) + Worker CP-SAT.

---

## 🗂️ Índice Maestro de Especificaciones

| Archivo | Tipo | Resumen Técnico |
| :--- | :--- | :--- |
| [`00-architecture-tech-stack.md`](./00-architecture-tech-stack.md) | **Arquitectura & Stack** | Especificación de Express + TypeScript, SSR con EJS/HTMX, Prisma ORM, PostgreSQL y Worker desacoplado de optimización. |
| [`01-domain-rules.md`](./01-domain-rules.md) | **Dominio & Normativa UBV** | Ley de Universidades, Documento Rector UBV, dedicaciones (DE, TC, MT, TV), horas de campo/comunidad sin aula fija, catálogo de restricciones duras (`H-01` a `H-10`) y blandas (`S-01` a `S-08`). |
| [`02-orm-schema.prisma`](./02-orm-schema.prisma) | **ORM & Modelado TypeScript** | Esquema Prisma completo con tipos ENUM, modelos relacionales, soporte de auditoría de ajustes y tipos estáticos exportables a TypeScript. |
| [`02-database-schema.sql`](./02-database-schema.sql) | **DDL Nativo PostgreSQL** | Esquema SQL físico con extensiones `btree_gist`, exclusión temporal `EXCLUDE USING gist` y vista de consolidación de carga docente. |
| [`03-solver-formulation.md`](./03-solver-formulation.md) | **Formulación Matemática Solver** | Variables de decisión discretas (slots de 45 min), ecuaciones de restricciones duras, función multiobjetivo y flujo de ejecución con Google OR-Tools CP-SAT. |
| [`04-routes-and-views-spec.md`](./04-routes-and-views-spec.md) | **Rutas Express & Vistas SSR** | Enrutamiento de Express, controladores TypeScript, plantillas EJS y endpoints reactivos HTMX para validación en tiempo real de Drag & Drop. |
| [`04-openapi-spec.yaml`](./04-openapi-spec.yaml) | **Contratos REST Auxiliares** | Especificación OpenAPI 3.1 para jobs de optimización, integración con SUR@UBV y exportaciones externas. |
| [`05-acceptance-tests.feature`](./05-acceptance-tests.feature) | **Pruebas de Aceptación (BDD)** | Casos de prueba Gherkin ejecutables en español para verificar topes legales, no solapamiento, teletransportación territorial y auditoría. |
| [`06-auth-roles-permissions.md`](./06-auth-roles-permissions.md) | **Autenticación & RBAC** | Matriz de roles (`ADMINISTRADOR`, `DIRECTOR_ACADEMICO`, `COORDINADOR_PFG`, `DOCENTE`), sesiones con cookies y protección de endpoints. |
| [`07-ui-components-spec.md`](./07-ui-components-spec.md) | **Componentes de UI (Frontend)** | Especificación del componente reutilizable `SchaahDataTable` con búsqueda, filtros cruzados, paginación y ordenamiento. |
| [`08-capitulo-1-problema-y-objetivos.md`](./08-capitulo-1-problema-y-objetivos.md) | **Marco Metodológico (Capítulo I)** | Planteamiento del problema (UCTP NP-duro en UBV), objetivos generales/específicos, justificación (teórica, técnica, social e institucional), alcance y área de investigación. |
| [`09-mallas-curriculares-spec.md`](./09-mallas-curriculares-spec.md) | **Mallas Curriculares & PFG** | Gestión web de Programas de Formación de Grado, unidades curriculares por trayecto/tramo, desglose horario ($H_T, H_P, H_C$) y tipología de espacios requeridos. |


---

## 🛠️ Ciclo de Ejecución

1. **Persistencia**: Inicializar Prisma con `specs/02-orm-schema.prisma` y aplicar extensiones de `specs/02-database-schema.sql`.
2. **Core Domain & Servicios**: Desarrollar lógica de validación de restricciones en TypeScript (`H-01` a `H-10`) en `src/core/domain`.
3. **Controladores y Vistas SSR**: Construir vistas EJS y rutas Express siguiendo `specs/04-routes-and-views-spec.md`.
4. **Worker Solver**: Integrar el script de optimización CP-SAT en `worker/` respetando `specs/03-solver-formulation.md`.
5. **Testing**: Validar el comportamiento del sistema contra los escenarios BDD de `specs/05-acceptance-tests.feature`.
