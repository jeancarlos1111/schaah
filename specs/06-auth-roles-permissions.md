# Spec 6: Autenticación, Usuarios, Roles y Permisos (RBAC)
**Sistema Automatizado para la Asignación de Horarios Académicos (SAHAD — UBV Eje Regional Kerepakupai Vena)**

---

## 1. Matriz de Roles y Permisos (RBAC)

| Permiso / Acción | `ADMINISTRADOR` | `PLANIFICADOR` | `COORDINADOR_PFG` | `DOCENTE` |
| :--- | :---: | :---: | :---: | :---: |
| **Gestionar Usuarios y Roles** | ✅ Total | ❌ | ❌ | ❌ |
| **Habilitar / Deshabilitar Registros (Toggles)** | ✅ Total | ❌ | ❌ | ❌ |
| **Consultar Bitácora de Auditoría Global** | ✅ Total | ❌ | ❌ | ❌ |
| **Configurar Sedes y Aulas** | ✅ Total | ✅ Total (sin toggle) | 👁️ Lectura | ❌ |
| **Crear y Abrir Período Lectivo** | ✅ Total | ✅ Total | ❌ | ❌ |
| **Aprobar / Publicar Horarios** | ✅ Total | ✅ Total | ❌ | ❌ |
| **Crear / Editar Programas de Formación** | ✅ Total | ✅ Total (sin toggle) | ❌ | ❌ |
| **Gestionar Unidades Curriculares (malla)** | ✅ Total | ✅ Total (sin toggle) | ✅ Sus programas | ❌ |
| **Cargar Secciones y Matrícula** | ✅ Total (salvo *Cerrado*) | ✅ Total (salvo *Cerrado*) | ✅ Sus programas (ventana abierta) | ❌ |
| **Eliminar Asignaciones (Secciones)** | ✅ Total (salvo *Cerrado*) | ✅ Total (salvo *Cerrado*) | ✅ Sus programas (ventana abierta) | ❌ |
| **Ejecutar y Aplicar Motor Solver** | ✅ Total | ✅ Total | ❌ (Solo Administrador / Planificador) | ❌ |
| **Ajuste Manual Horarios (Drag&Drop / Espacios)** | ✅ Total | ✅ Con registro | 👁️ Lectura (Matriz solo lectura, sin mover/eliminar) | ❌ |
| **Registrar Disponibilidad Horaria** | ✅ Cualquiera (con motivo) | ✅ Cualquiera (con motivo) | ✅ Docentes de sus programas (con motivo) | ✅ Solo la suya |
| **Consultar Historial de Disponibilidad** | ✅ Cualquiera | ✅ Cualquiera | ✅ Docentes de sus programas | ✅ El suyo |
| **Consultar Horarios Publicados** | ✅ Todos | ✅ Todos | ✅ Sus programas | ✅ Solo su horario |
| **Listado de Períodos y Asignaciones del Período** | ✅ Total | ✅ Total | ✅ Sus programas | ❌ (se le muestra su horario) |
| **Ver Reporte Consolidado Carga** | ✅ Todos | ✅ Todos | ✅ Sus programas | ❌ (ve su horario / disponibilidad / oferta .xlsx en Normativa) |
| **Asignar / Cambiar Docente de una Asignación UC** | ✅ Total (salvo *Cerrado*) | ✅ Total (salvo *Cerrado*) | ✅ Sus programas (ventana abierta) | ❌ |
| **Importar Oferta de Carga Horaria (.xlsx)** | ✅ Total | ✅ Total | ❌ | ❌ |
| **Ver y Exportar Oferta e Inconsistencias** | ✅ Todos | ✅ Todos | ✅ Sus programas | 👁️ Lectura (sesión iniciada) |
| **Confirmar Códigos Provisionales de UC** | ✅ Total | ✅ Total | ✅ Sus programas | ❌ |
| **Respaldo de Base de Datos** | Consola del servidor (`pnpm db:respaldo`) y automático antes de cada importación | — | — | — |

> [!NOTE]
> En las rutas de oferta, "Ver y Exportar" solo exige sesión (`requireAuth`); importar, ver la vista previa, confirmar y cancelar exigen `ADMINISTRADOR` o `PLANIFICADOR`; confirmar códigos acepta además `COORDINADOR_PFG`. "Sus programas" significa los programas vinculados al usuario en `UsuarioPrograma` y se aplica en el servidor (sección 4).

---

## 2. Mecanismo de Sesión y Seguridad

1. **Sesiones HTTP con Cookie HttpOnly**:
   - `express-session` con cookie segura, `sameSite: 'lax'`, `httpOnly: true`.
   - Tiempo de expiración: 8 horas (jornada laboral).
2. **Cifrado de Contraseñas**:
   - `bcryptjs` con factor de coste (salt rounds) = 10.
3. **Manejo de Intentos Fallidos**:
   - Mensaje genérico `"Credenciales inválidas"` para mitigar enumeración de usuarios.
4. **Protección de Rutas**:
   - `requireAuth`: Redirige a `/login` si no hay sesión activa.
   - `requireRole(roles...)`: Retorna código `403 Prohibido` si el rol no tiene privilegio.
5. **Ciclo de Vida de Usuarios (CRUD 100% Completo)**:
   - Creación con hash `bcrypt` y selector de rol.
   - Vinculación opcional con perfil en tabla `Profesor` para docentes.
   - Edición de nombres, apellidos y reasignación de rol RBAC.
   - Programas de formación coordinados (obligatorio al menos uno para `COORDINADOR_PFG`; ver sección 4).
   - Reestablecimiento forzado de contraseña por el Administrador.
   - Desactivación y activación de acceso con regla anti auto-bloqueo.

---

## 3. Cuentas Iniciales y Semillero de Desarrollo (`pnpm seed`)

Definidas en el script ejecutable [`src/scripts/seedAdmin.ts`](../src/scripts/seedAdmin.ts):

| Rol | Correo Electrónico | Contraseña Inicial | Nombres y Apellidos | Adscripción / Perfil |
| :--- | :--- | :--- | :--- | :--- |
| `ADMINISTRADOR` | `admin@ubv.edu.ve` | `ubv2026` | Administrador Sistema | Soporte Técnico y Control Global |
| `PLANIFICADOR` | `planificador@ubv.edu.ve` | `ubv2026` | Planificador Académico | Planificación y asignación de horarios |
| `COORDINADOR_PFG` | `coord.informatica@ubv.edu.ve` | `ubv2026` | Pedro Pérez | Coordinación PFG Informática (vinculado a `PFG-INFO`) |
| `DOCENTE` | `carlos.gomez@ubv.edu.ve` | `ubv2026` | Carlos Gómez | Cédula V-15890123 (Asistente, Ordinario) |

> [!NOTE]
> El enum `DIRECTOR_ACADEMICO` es un **alias de compatibilidad** de `PLANIFICADOR` (mismo privilegio). En entornos de producción, estas credenciales se regeneran y las contraseñas temporales se fuerzan a cambio en el primer inicio de sesión.

---

## 4. Alcance del Coordinador por Programa (`UsuarioPrograma`)

1. **Modelo**: la tabla `usuarios_programas` (`UsuarioPrograma`, única por `usuarioId + pfgId`) vincula a cada `COORDINADOR_PFG` con uno o varios programas de formación. El Administrador los asigna en **Usuarios → Nuevo / Editar** (selector de programas con búsqueda, visible solo para el rol coordinador). Guardar un coordinador sin programas responde *"Seleccione al menos un programa de formación para el coordinador."*
2. **Carga por petición**: el middleware `cargarAlcancePfg` (después de `attachUserToLocals`) consulta los vínculos con programas activos en cada petición y deja `req.alcancePfg` / `res.locals.alcancePfg`. Los cambios del Administrador aplican sin volver a iniciar sesión. `ADMINISTRADOR`, `PLANIFICADOR` (y el alias `DIRECTOR_ACADEMICO`) y `DOCENTE` tienen alcance total; un coordinador sin programas no ve ni modifica nada.
3. **Reglas de dominio** (`src/core/domain/rules/alcancePfgRules.ts`): `puedeGestionarPfg`, `filtroPfg` (cláusula Prisma `{ in: [...] }`), `filtroPfgEfectivo` (un filtro pedido fuera del alcance se ignora) y `pfgVisible` (programa seleccionado por defecto en la malla).
4. **Listados filtrados**: mallas, asignaciones del período (tabla, contadores y selector de programa y cohortes), contadores del panel principal y de períodos, matriz de horarios (pendientes y selector), consolidado de carga (docentes con asignaciones en sus programas), oferta, inconsistencias y sus exportaciones. El PFG de una asignación es el de su unidad curricular (`seccion.unidadCurricular.pfgId`).
5. **Escritura**: crear, editar o activar unidades; crear asignaciones y cohortes; asignar docente; confirmar códigos provisionales sobre un programa ajeno responden **403** (`{ ok: false, error: "Acceso denegado: ..." }` si la petición es JSON; página de error en otro caso). Colocar, mover o eliminar bloques y aplicar el solver están reservados a `ADMINISTRADOR` y `PLANIFICADOR` (`ROLES_PROGRAMACION_HORARIOS`); el Coordinador ve la matriz en solo lectura.
6. **Matriz de horarios**: los bloques de otros programas se muestran como *"Ocupado: otro programa"* (no arrastrables ni eliminables) porque siguen ocupando docentes, aulas y cohortes. El Coordinador no arrastra ni elimina bloques.
7. **Solver**: solo `ADMINISTRADOR` y `PLANIFICADOR` ejecutan y aplican el motor (`solverRoutes` + `puedeProgramarHorarios`). El Coordinador no tiene acceso a esas rutas.
8. **Sedes y aulas**: el coordinador solo consulta; las rutas de escritura exigen `ADMINISTRADOR` o `PLANIFICADOR` y la vista oculta los botones de gestión. Los toggles activar/desactivar son exclusivos del Administrador.
9. **Pruebas**: `tests/domain/alcancePfgRules.test.ts`, `tests/roles/planificadorPermissions.test.ts`, `tests/horarios/matrizSoloLectura.test.ts` y la regla *"Alcance del coordinador por programa (Spec 06)"* de la Spec 05 (`tests/acceptance/coordinador.steps.test.ts`).

---

## 5. Disponibilidad Auditada y Alcance del Docente

1. **Quién edita la disponibilidad** (`permisoDisponibilidad` en `src/core/domain/rules/disponibilidadPermisos.ts`):
   - El `DOCENTE` edita solo la suya (ficha vinculada a la cuenta por `profesorId` o, en su defecto, por correo), sin motivo.
   - `ADMINISTRADOR` y `PLANIFICADOR` (alias `DIRECTOR_ACADEMICO`) editan la de cualquier docente, con motivo obligatorio, para casos en que el docente no pueda hacerlo (por ejemplo, una emergencia).
   - `COORDINADOR_PFG` edita la de los docentes con al menos una asignación de sus programas **en el período elegido**; en la nómina de docentes el botón *Disponibilidad* solo aparece en esos docentes (período que se planifica por defecto). Fuera de ese alcance la vista y el guardado responden **403**.
2. **Motivo obligatorio para terceros**: quien edita la disponibilidad de otro docente debe escribir el *Motivo del cambio* (mínimo 10 caracteres; espacios repetidos se compactan). Sin motivo válido se redirige con *"Indique el motivo del cambio (al menos 10 caracteres): no se guardaron cambios."* y no se toca nada.
3. **Historial auditable** (`AuditoriaDisponibilidad`, tabla `auditoria_disponibilidad`): cada guardado con cambios reales registra, en la **misma transacción** que reemplaza las franjas, el correo y el rol del responsable, la fecha, el resumen (*"2 franjas agregadas, 1 franja quitada, 1 cambio de prioridad"*), el motivo y las franjas anteriores y nuevas en JSON (solo las disponibles, ordenadas por día y hora). Guardar sin cambios no escribe nada y responde *"Sin cambios en la disponibilidad del período ...: no se registró nada."* La matriz de disponibilidad muestra los últimos 20 registros del docente en el período (fecha en formato `dd/mm/aaaa hh:mm AM/PM`, responsable, rol, detalle de franjas y motivo).
4. **Períodos y asignaciones**: `GET /periodos` y `GET /periodos/:id/secciones` redirigen al `DOCENTE` a su horario (`/horarios` o `/periodos/:id/horarios`) con el aviso *"La gestión de períodos y secciones corresponde a la planificación; se muestra su horario."*; un error recibido en la URL se conserva en lugar del aviso.
5. **Matriz de horarios del docente**: siempre `tipo=DOCENTE` con su propia ficha. Pedir otra perspectiva (aula, asignación, cohorte) u otro docente redirige a su horario con *"Solo puede consultar su propio horario."*; el filtro de programa se descarta. La vista oculta las pestañas de perspectiva, el selector de docente y el filtro de P.F.G., y el catálogo de docentes que recibe la vista contiene solo al propio docente. Una cuenta `DOCENTE` sin ficha vinculada recibe una página de error (403) en lugar de un horario ajeno.
6. **Pruebas**: `tests/domain/disponibilidadPermisos.test.ts`, `tests/docentes/disponibilidadAuditoria.test.ts`, `tests/periodos/docentePeriodos.test.ts` y `tests/horarios/matrizSoloLectura.test.ts`.
