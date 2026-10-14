# Spec 6: Autenticación, Usuarios, Roles y Permisos (RBAC)
**Sistema Automatizado para la Asignación de Horarios Académicos (SAHAD — UBV Eje Regional Kerepakupai Vena)**

---

## 1. Matriz de Roles y Permisos (RBAC)

| Permiso / Acción | `ADMINISTRADOR` | `DIRECTOR_ACADEMICO` | `COORDINADOR_PFG` | `DOCENTE` |
| :--- | :---: | :---: | :---: | :---: |
| **Gestionar Usuarios y Roles** | ✅ Total | ❌ | ❌ | ❌ |
| **Configurar Sedes y Aulas** | ✅ Total | 👁️ Lectura | 👁️ Lectura | ❌ |
| **Crear y Abrir Período Lectivo** | ✅ Total | ✅ Total | ❌ | ❌ |
| **Aprobar / Publicar Horarios** | ✅ Total | ✅ Total | ❌ | ❌ |
| **Gestionar PFG y Unidades Curriculares**| ✅ Total | ✅ Total | ✅ Su PFG | ❌ |
| **Cargar Secciones y Matrícula** | ✅ Total | ✅ Total | ✅ Su PFG | ❌ |
| **Ejecutar Motor Solver CP-SAT** | ✅ Total | ✅ Total | ✅ Su PFG | ❌ |
| **Ajuste Manual Horarios (Drag&Drop)** | ✅ Total | ✅ Con registro | ✅ Su PFG (con justificación) | ❌ |
| **Registrar Disponibilidad Horaria** | ✅ Cualquiera | ❌ | ❌ | ✅ Solo la suya |
| **Consultar Horarios Publicados** | ✅ Todos | ✅ Todos | ✅ Su PFG | ✅ Sus secciones |
| **Ver Reporte Consolidado Carga** | ✅ Todos | ✅ Todos | ✅ Su PFG | ✅ Su planilla |

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
   - Reestablecimiento forzado de contraseña por el Administrador.
   - Desactivación y activación de acceso con regla anti auto-bloqueo.

---

## 3. Cuentas Iniciales y Semillero de Desarrollo (`pnpm seed`)

Definidas en el script ejecutable [`src/scripts/seedAdmin.ts`](../src/scripts/seedAdmin.ts):

| Rol | Correo Electrónico | Contraseña Inicial | Nombres y Apellidos | Adscripción / Perfil |
| :--- | :--- | :--- | :--- | :--- |
| `ADMINISTRADOR` | `admin@ubv.edu.ve` | `ubv2026` | Administrador Sistema | Soporte Técnico y Control Global |
| `DIRECTOR_ACADEMICO` | `director.academico@ubv.edu.ve` | `ubv2026` | María Rodríguez | Dirección General Académica |
| `COORDINADOR_PFG` | `coord.informatica@ubv.edu.ve` | `ubv2026` | Pedro Pérez | Coordinación PFG Informática |
| `DOCENTE` | `carlos.gomez@ubv.edu.ve` | `ubv2026` | Carlos Gómez | Cédula V-15890123 (Asistente, Ordinario) |

> [!NOTE]
> En entornos de producción, estas credenciales se regeneran y las contraseñas temporales se fuerzan a cambio en el primer inicio de sesión.

