# AGENTS.md - Reglas del Proyecto SAHAD UBV

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
   - Paginación, ordenación y filtrado en servidor según Spec 07 (`SahadDataTable`).

## Reglas Mandatorias de Pruebas y Calidad de Código (TDD / BDD)
1. **Pruebas Reales Obligatorias con Vitest**:
   - Todo módulo, servicio de dominio, validador de restricciones horarias y cálculo de carga docente o mallas curriculares debe contar con pruebas automatizadas en `tests/` ejecutables con `pnpm test`.
   - El desarrollo de nuevas características o refactorizaciones debe acompañarse progresivamente de sus pruebas correspondientes.

2. **Cero Atajos o Pruebas Falsas (Anti-Bypass Rule)**:
   - **Prohibido terminantemente** que el agente cree pruebas vacías, aserciones triviales o placebos (`expect(true).toBe(true)`, `test.skip`, `exit 0` simulados).
   - **Prohibido mockear la lógica de negocio bajo prueba**: Se deben instanciar y probar las funciones, algoritmos y reglas reales del dominio (solapamiento docente/aula, antiteletransportación, límites de dedicación DE/TC/MT/TV, formateo 12h civil, aforos).
   - Los mocks se restringen exclusivamente a dependencias de infraestructura externa inalcanzables en test aislado (como base de datos física no disponible en CI o red externa), sin alterar los flujos de validación del dominio.

3. **Ejecución y Verificación Obligatoria**:
   - El agente debe ejecutar `pnpm test` (o `npx vitest run`) tras modificar código o pruebas para comprobar que la suite pase al 100% en verde. Prohibido reportar tareas como listas sin comprobación real en consola.

