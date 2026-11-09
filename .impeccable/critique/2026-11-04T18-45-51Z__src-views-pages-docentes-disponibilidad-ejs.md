---
target: src/views/pages/docentes/disponibilidad.ejs
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/home/jean/www/node/Express/sahad/src/views/pages/docentes/disponibilidad.ejs"
target_fingerprint: "sha256:8b41b5663fef5a43ea60cd0b949bd4d8170da57f0923d12c67b184df3934910b"
target_path: /home/jean/www/node/Express/sahad/src/views/pages/docentes/disponibilidad.ejs
timestamp: 2026-11-04T18-45-51Z
slug: src-views-pages-docentes-disponibilidad-ejs
closed: true
---
Method: dual-agent (A: b2befc9a-07b9-469c-b93a-869a66372b22 · B: b49b47a3-c1db-48fb-92b9-a7868fe6d8f1)

### Design Health Score

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 2 | Sin contador en vivo de bloques/horas seleccionadas vs. dedicación `[minh - maxh]` ni indicador de cambios sin guardar |
| 2 | Match System / Real World | 4 | Lenguaje institucional UBV exacto: formato civil 12h AM/PM, bloques, turnos, dedicación CCU y prelación P1-P3 |
| 3 | User Control and Freedom | 2 | Cambiar de período descarta cambios sin aviso; botones de turno sobrescriben otros turnos sin confirmación ni botón Restaurar |
| 4 | Consistency and Standards | 3 | Clases `.status-info` y `.status-warning` inexistentes en CSS; estilos inline y `#e11d48` hardcoded en `main.ejs`; botones rápidos sin `uk-icon` |
| 5 | Error Prevention | 2 | Acciones masivas destructivas en un clic; sin advertencia visual en columnas fuera de `diasDisponibles` |
| 6 | Recognition Rather Than Recall | 3 | `diasDisponibles` y horas requeridas obligan a recordar y contar mentalmente sobre la grilla |
| 7 | Flexibility and Efficiency | 2 | Ciclo individual de 4 clics por celda sin soporte de teclado (`Tab`/`Space`/`1-3`) ni arrastre o selección por día |
| 8 | Aesthetic and Minimalist Design | 3 | Estética sobria y densa; duplicidad de botón `Guardar Cambios` cuando `requiereMotivo` está activo |
| 9 | Error Recovery | 3 | Alertas claras, pero el campo obligatorio `#disp-motivo` queda oculto debajo de la matriz al pulsar Guardar arriba |
| 10 | Help and Documentation | 3 | Buenos subtítulos normativos (`H-06`, `S-02`) y tooltips explicativos |
| **Total** | | **27/40** | **Acceptable (67.5%)** |

### Design Specificity Verdict
- **LLM assessment**: La vista encarna "The Academic Command Matrix" (`DESIGN.md`) con capas oscuras/claras, formato civil 12h AM/PM y trazabilidad normativa (`#historial-disponibilidad`), pero presenta fricción operativa en la matriz interactiva (sin contador de horas en vivo, sin accesibilidad por teclado ni columna fija en móvil).
- **Deterministic scan**: 4 hallazgos en `src/views/layouts/main.ejs` (`#e11d48` fuera de `DESIGN.md` en línea 49, `rgba(0,0,0,0.3)` inline en línea 47, `font-size: 0.65rem` fuera de escala en línea 50, y aviso informativo sobre `Plus Jakarta Sans` en línea 23); 0 hallazgos estáticos en `disponibilidad.ejs`.

### What's Working
1. **Ficha Rápida Normativa (`disponibilidad.ejs:52-97`)**: Reúne cédula, adscripción PFG, días acordados (`H-DIAS-DISPONIBILIDAD`), restricción de piso (`H-ACCESIBILIDAD-PISO`) y horquilla de dedicación CCU.
2. **Historial Auditable (`#historial-disponibilidad`)**: Diferencia semánticamente franjas agregadas, quitadas y cambios de prioridad con fecha tabular (`tabular-nums`).
3. **Codificación Semántica de Celdas (`disponibilidad.css:17-41`)**: Estados `P1`, `P2`, `P3` y `NO` usan superficies tintadas y etiquetas explícitas sin depender solo del color.

### Priority Issues
- **[P1] Celdas de matriz inaccesibles por teclado/lector de pantalla y sin aceleradores por día o arrastre**: `.disp-cell` carece de `tabindex="0"`, `role="button"`, `aria-label`, soporte de teclas (`Enter`/`Space`/`1`/`2`/`3`/`0`), arrastre con puntero y columna de hora `sticky` en móvil. Suggested command: `/impeccable harden`
- **[P1] Sin contador en vivo de bloques/horas seleccionadas frente a la dedicación CCU y días acordados**: El usuario marca celdas a ciegas sin ver cuántos bloques/horas lleva acumulados ni qué columnas están fuera de `diasDisponibles`. Suggested command: `/impeccable clarify`
- **[P1] Panel de motivo obligatorio (`#disp-motivo`) oculto debajo de la matriz y pérdida accidental de cambios**: Al editar como Coordinador/Admin, el botón superior `Guardar Cambios` falla silenciosamente hasta hacer scroll al final; cambiar de período o usar botones de turno pisa cambios sin aviso. Suggested command: `/impeccable layout`
- **[P2] Deriva de tokens y reglas de `AGENTS.md` en `disponibilidad.ejs` y `main.ejs`**: `.status-info` y `.status-warning` no existen en CSS; botones rápidos `.btn-clean-ghost` no tienen `uk-icon`; `main.ejs` usa `style="..."` inline con `#e11d48` y `0.65rem`. Suggested command: `/impeccable polish`
