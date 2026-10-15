# Spec 0: Arquitectura Tecnológica y Stack de Ejecución
**Sistema Automatizado para la Asignación de Horarios Académicos (SAHAD — UBV Eje Regional Kerepakupai Vena)**

---

## 1. Definición del Stack Tecnológico

| Capa | Tecnología | Justificación |
| :--- | :--- | :--- |
| **Runtime & Gestor** | Node.js 22 LTS (`.nvmrc`, `engines: >=22`) + pnpm (v9+) | Instalaciones rápidas, deduplicación eficiente en disco y lockfile determinista (`pnpm-lock.yaml`). |
| **Lenguaje** | TypeScript (v5+) | Tipado estático estricto, contratos de dominio compartidos y compilación limpia. |
| **Framework Web** | Express.js (v4 / v5) | Enrutamiento ligero, modular por routers, middleware robusto. |
| **Renderizado Servidor (SSR)** | EJS + `express-ejs-layouts` | SSR con motor de layouts maestro automático (`layouts/main.ejs`); garantiza herencia visual en todas las vistas de controladores. |
| **ORM & Persistencia** | Prisma ORM | Modelado declarativo de esquemas, migraciones seguras y generación automática de tipos TypeScript. |
| **Base de Datos (Desarrollo)** | SQLite 3 (Modo WAL) | Motor embebido sin dependencias externas; concurrencia optimizada mediante `PRAGMA journal_mode = WAL;`. |
| **Base de Datos (Producción)** | PostgreSQL 15+ | Soporte relacional corporativo con extensiones `btree_gist` para exclusiones temporales. |
| **Motor Solver** | Google OR-Tools (CP-SAT) WebAssembly (`or-tools-wasm`, requiere Node ≥ 21 por el global `navigator`) | Paquete oficial compilado a WebAssembly ejecutado en Node.js mediante `worker_threads` (o worker pool). Elimina dependencia externa de runtime Python; resuelve problema NP-duro sin bloquear event loop de Express. |
| **Hojas de Cálculo** | `exceljs` + `multer` (memoria, máx. 15 MB) | Lectura y escritura del consolidado institucional de oferta en `.xlsx` (Spec 10) y del reporte de inconsistencias. |
| **Respaldos** | `VACUUM INTO` de SQLite | Copia consistente aun en modo WAL, en `backups/` con rotación (30 copias). |
| **Diseño Web & UI** | Clean Enterprise SaaS (Linear/Vercel) + UIkit 3 | Estética sobria, moderna y de alta densidad. Cabecera fija de 54px en una sola fila, tarjetas Bento, tablas de datos con búsqueda en vivo, modales limpios y soporte dual de temas claro y oscuro con persistencia en `localStorage`. |

---

## 2. Diagrama de Arquitectura de la Aplicación

```mermaid
graph TD
    User([Navegador / Coordinador UBV]) <-->|HTTP / HTML + HTMX| Express[Servidor Express + TypeScript]
    
    subgraph "Express Server (Node.js)"
        Middleware[Auth & Permisos Middleware] --> Controllers[Controladores Web SSR]
        Controllers --> Views[Motor Vistas EJS]
        Controllers --> Services[Servicios de Negocio]
        Services --> ORM[Prisma ORM Client]
        Services --> SolverDispatcher[Despachador Solver]
    end

    ORM <-->|SQL / Pool Conexiones| Postgres[(PostgreSQL 15+)]
    SolverDispatcher <-->|worker_threads / Piscina| SolverWasm[Worker Node.js + @google/ortools WebAssembly]
    SolverWasm <-->|Lectura/Escritura vía Prisma| Postgres
```

---

## 3. Estructura del Proyecto

```text
sahad/
├── package.json
├── tsconfig.json
├── prisma/
│   ├── schema.prisma            # Spec del ORM y modelos de base de datos
│   └── migrations/              # Migraciones versionadas
├── src/
│   ├── server.ts                # Inicialización de Express
│   ├── config/                  # Variables de entorno y configuración
│   ├── core/
│   │   ├── database/            # Cliente Prisma y respaldo SQLite (respaldo.ts)
│   │   ├── domain/              # Tipos TypeScript, Enums, Reglas H, S, RC y normalización de la oferta
│   │   └── errors/              # Manejo centralizado de excepciones
│   ├── modules/
│   │   ├── auth/                # Sesiones y control de acceso
│   │   ├── docentes/            # Gestión de profesores, dedicaciones y disponibilidad
│   │   ├── espacios/            # Sedes y aulas
│   │   ├── curriculo/           # PFG, Unidades Curriculares y prelaciones
│   │   ├── periodos/            # Períodos lectivos, cohortes y asignaciones UC
│   │   ├── oferta/              # Importación/exportación del consolidado .xlsx e inconsistencias (Spec 10)
│   │   ├── horarios/            # Asignación, visualizador semanal y drag & drop
│   │   └── solver/              # Despachador y lógica de ejecución CP-SAT
│   ├── scripts/                 # Seeds, importación de oferta y respaldo por consola
│   ├── views/                   # Plantillas SSR (EJS)
│   │   ├── layouts/             # Base layout, header, navegación
│   │   ├── partials/            # Componentes reutilizables (tablas, alertas, modales)
│   │   └── pages/               # Vistas específicas por módulo
│   ├── public/                  # Assets estáticos (CSS, scripts ligeros para Drag & Drop)
│   └── workers/
│       ├── solver.worker.ts     # Worker Node.js con @google/ortools (WebAssembly)
│       └── cpsat-model.ts       # Modelado matemático CP-SAT en TypeScript
├── backups/                     # Respaldos SQLite rotativos (excluido de git)
├── tests/                       # Pruebas Vitest (domain/, oferta/, database/, acceptance/ y helpers/)
└── specs/                       # Documentación formal de desarrollo
```

---

## 4. Estándar de Gestión de Paquetes (pnpm)

- Gestor mandatorio: `pnpm`.
- Archivo de bloqueo: `pnpm-lock.yaml` (estricto en CI/CD).
- Comandos canónicos:
  - Instalación: `pnpm install`
  - Generación Prisma: `pnpm prisma:generate` (o `pnpm dlx prisma generate`)
  - Migraciones: `pnpm prisma:migrate`
  - Servidor de desarrollo: `pnpm dev`
  - Compilación de producción: `pnpm build`
  - Arranque de producción: `pnpm start`
  - Pruebas: `pnpm test` (toda la suite, incluidos los escenarios de la Spec 05)
  - Aceptación: `pnpm test:acceptance` ejecuta `specs/05-acceptance-tests.feature` con `@amiceli/vitest-cucumber`; los pasos están en `tests/acceptance/<regla>.steps.test.ts` (uno por `Regla:`, filtrado por su etiqueta) y las reglas con base de datos usan una SQLite efímera (`tests/helpers/baseTemporal.ts`)
  - Semillas: `pnpm seed` (administrador), `pnpm seed:espacios`, `pnpm seed:oferta`
  - Importar oferta por consola: `pnpm oferta:importar <archivo.xlsx> <codigoPeriodo> [--aplicar]` (sin `--aplicar` solo muestra el plan; con `--aplicar` respalda la base y aplica)
  - Respaldo manual: `pnpm db:respaldo [etiqueta]`

