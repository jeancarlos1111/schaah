# Reglas de Interfaz y Diseño de SCHAAH (Mandatorias)

## 1. Cero Elementos sin Estilo
- Ningún elemento HTML (botón, dropdown, modal, input, select, tabla o badge) puede introducirse sin sus reglas CSS correspondientes en `src/public/css/style.css`.
- Todo componente debe reflejar la estética Clean Enterprise SaaS (Linear / Vercel) y UIkit 3 establecida en `specs/00-architecture-tech-stack.md` y `specs/07-ui-components-spec.md`.

## 2. Botones de Acción en Tablas
- Todo botón de acción en tablas debe poseer etiqueta textual legible (`<span>`) e icono semántico correspondiente.
- Se prohíben cápsulas vacías o botones con icono solitario que generen ambigüedad visual o desajuste de padding.
- Los botones de grupo deben utilizar `.table-actions-cell` y `.table-actions-group` con `display: flex !important; width: 100% !important; justify-content: flex-end !important;`.

## 3. Dropdowns y Diálogos Flotantes
- Los menús desplegables deben usar `.clean-dropdown` con `border`, `box-shadow` suave, `border-radius: 8px` y fondo `var(--surface-card)`.
- Las opciones deben usar `.dropdown-action-btn` con icono, texto y estados de hover definidos (incluyendo `.text-danger` y `.text-success`).

## 4. Alineación Estricta a Spec 07 (DataTable)
- Paginación obligatoria en servidor con `skip` y `take`.
- Búsqueda relacional con operador `OR` y debounce.
- Filtros por catálogo evaluados en servidor.
- Tarjetas Bento métricas desacopladas de la paginación.
