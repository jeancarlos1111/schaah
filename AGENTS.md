# AGENTS.md - Reglas del Proyecto SCHAAH UBV

## Reglas Mandatorias de Diseño de Interfaz y UI
1. **Cero Elementos sin Estilo**:
   - Todo elemento (botón, menú, dropdown, modal, formulario, tabla) debe tener estilos completos y específicos definidos en `src/public/css/style.css`.
   - Prohibido el uso de controles nativos o clases CSS inexistentes.

2. **Botones de Acción en Tablas**:
   - Todo botón de acción debe tener etiqueta descriptiva visible (`<span>Texto</span>`) e icono semántico (`<span uk-icon="..."></span>`). Prohibidos botones con iconos aislados o cápsulas vacías.
   - Las acciones de tabla deben residir en `.table-actions-cell` con `.table-actions-group` justificadas a la derecha (`justify-content: flex-end`).

3. **Dropdowns y Menús Desplegables**:
   - Estilizados formalmente con `.clean-dropdown` (tarjeta oscura/clara, bordes sutiles, sombra flotante y `border-radius: 8px`).
   - Botones internos con `.dropdown-action-btn`, iconos representativos y colores semánticos (`.text-danger`, `.text-success`).

4. **Cumplimiento Estricto de Specs**:
   - Formato civil venezolano de 12 horas con AM/PM en todas las vistas de horarios y disponibilidades.
   - Paginación, ordenación y filtrado en servidor según Spec 07 (`SchaahDataTable`).
