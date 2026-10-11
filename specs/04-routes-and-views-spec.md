# Spec 4: Rutas, Controladores y Vistas SSR (Express + EJS + HTMX)
**Sistema de Carga Horaria y Asignación Automática de Horarios (SCHAAH - UBV)**

---

## 1. Patrón Arquitectónico SSR + HTMX

- **Renderizado Principal**: Servidor Express inyecta datos en plantillas **EJS**.
- **Interactividad (Drag & Drop y Validación)**:
  - El navegador ejecuta un script ligero para arrastrar bloques de clase (`dragstart`, `dragover`, `drop`).
  - Al soltar o pasar sobre una celda, emite una petición asíncrona a Express (`/validar-drop`).
  - Express evalúa las restricciones duras (`H-01`, `H-02`, `H-03`, `H-09`) y retorna un fragmento HTML (badge verde o alerta roja de conflicto con detalle legal).

---

## 2. Mapa Completo de Rutas y Vistas

### 2.1 Módulo de Autenticación, Usuarios y Dashboard
| Método | Ruta | Controlador | Vista EJS | Descripción |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/login` | `AuthController.showLogin` | `pages/auth/login.ejs` (layout: false) | Formulario de acceso. |
| `POST` | `/login` | `AuthController.login` | Redirect | Valida credenciales e inicia sesión. |
| `GET` | `/logout` | `AuthController.logout` | Redirect | Cierra sesión. |
| `GET` | `/` | `DashboardController.index` | `pages/dashboard.ejs` | Métricas generales del período activo. |
| `GET` | `/usuarios` | `UsuariosController.index` | `pages/usuarios/index.ejs` | Listado completo de usuarios, roles, buscador en tiempo real y modal de creación. |
| `POST` | `/usuarios` | `UsuariosController.crear` | Redirect | Registro de nueva cuenta con hash de contraseña. |
| `POST` | `/usuarios/:id/editar` | `UsuariosController.editar` | Redirect | Modificación de nombres, apellidos y rol RBAC. |
| `POST` | `/usuarios/:id/reset-password` | `UsuariosController.resetPassword` | Redirect | Asignación de nueva contraseña cifrada. |
| `POST` | `/usuarios/:id/toggle` | `UsuariosController.toggleEstado` | Redirect | Activar o desactivar cuenta de usuario. |

### 2.2 Módulo de Docentes y Disponibilidad
| Método | Ruta | Controlador | Vista EJS | Descripción |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/docentes` | `DocentesController.index` | `pages/docentes/index.ejs` | Listado server-side con DataTable de profesores, filtros por dedicación, escalafón y adscripción territorial. |
| `GET` | `/mi-disponibilidad` | `DocentesController.miDisponibilidad` | Redirect | Redirección directa y segura a la matriz semanal del docente autenticado según su perfil de sesión. |
| `GET` | `/docentes/:id/disponibilidad` | `DocentesController.disponibilidad` | `pages/docentes/disponibilidad.ejs` | Matriz semanal interactiva de 48 celdas (Lunes a Sábado, 8 bloques). Ciclo de 4 estados (`NO`, `P1`, `P2`, `P3`) y acciones rápidas masivas. Protegido por RBAC. |
| `POST` | `/docentes/:id/disponibilidad` | `DocentesController.guardarDisponibilidad` | Redirect `/docentes/:id/disponibilidad?msg=...` | Persiste slots habilitados y prioridades en tabla `profesor_disponibilidades` para el período lectivo activo. |
| `GET` | `/docentes/carga-consolidada` | `DocentesController.cargaConsolidada` | `pages/docentes/carga-consolidada.ejs` | Planilla oficial UBV (Docencia directa + proyecto/comunidad + asesoría + investigación/gestión). Auditoría H-04/H-05 y formato imprimible con firmas. |

### 2.3 Módulo de Espacios y Sedes
| Método | Ruta | Controlador | Vista EJS | Descripción |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/espacios` | `EspaciosController.index` | `pages/espacios/index.ejs` | Listado server-side con DataTable de aulas, laboratorios y catálogo de sedes/aldeas. |
| `POST` | `/espacios/aulas` | `EspaciosController.crearAula` | Redirect `/espacios` | Registro de aula/laboratorio con aforo, tipo y piso. |
| `POST` | `/espacios/aulas/:id/editar` | `EspaciosController.editarAula` | Redirect `/espacios` | Actualización de nombre, tipo, capacidad y piso del recinto. |
| `POST` | `/espacios/aulas/:id/toggle` | `EspaciosController.toggleAula` | Redirect `/espacios` | Habilitación o suspensión del espacio físico para el solver. |
| `POST` | `/espacios/sedes/nueva` | `EspaciosController.crearSede` | Redirect `/espacios?tab=sedes` | Registro de campus principal o Aldea Universitaria municipalizada. |
| `POST` | `/espacios/sedes/:id/editar` | `EspaciosController.editarSede` | Redirect `/espacios?tab=sedes` | Modificación de datos territoriales de la sede o aldea. |
| `POST` | `/espacios/sedes/:id/toggle` | `EspaciosController.toggleSede` | Redirect `/espacios?tab=sedes` | Habilitación o inhabilitación territorial de la sede. |

### 2.4 Módulo de Horarios y Motor de Optimización
| Método | Ruta | Controlador | Vista / Fragmento | Descripción |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/periodos/:id/horarios` | `HorariosController.matriz` | `pages/horarios/matriz.ejs` | Vista principal de matriz semanal con selector de vista (por Docente, por Aula, por Sección). |
| `POST` | `/periodos/:id/horarios/optimizar` | `SolverController.iniciar` | HTMX Fragment | Encola el worker CP-SAT con parámetros y pesos blandos. |
| `GET` | `/periodos/:id/horarios/solver-progreso` | `SolverController.progreso` | `partials/solver-status.ejs` | Polling HTMX (`hx-trigger="every 2s"`) con barra de progreso y convergencia del solver. |
| `POST` | `/periodos/:id/horarios/validar-drop` | `HorariosController.validarDrop` | `partials/drop-feedback.ejs` | Validador instantáneo para Drag & Drop. Retorna si el movimiento es legal o el conflicto exacto. |
| `POST` | `/periodos/:id/horarios/mover` | `HorariosController.moverBloque` | `partials/celda-horario.ejs` | Persiste el movimiento manual, crea log de auditoría y actualiza celda vía HTMX. |

### 2.5 Módulo de Exportación y Conectores
| Método | Ruta | Controlador | Salida | Descripción |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/periodos/:id/exportar/pdf` | `ReportesController.exportarPDF` | Stream PDF | Descarga formato oficial de horario por sección y planilla docente. |
| `GET` | `/periodos/:id/exportar/sur-ubv` | `ReportesController.exportarSUR` | Archivo CSV/JSON | Exportación compatible con la base de datos de SUR@UBV. |

### 2.6 Módulo de Mallas Curriculares y PFG
| Método | Ruta | Controlador | Vista / Fragmento | Descripción |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/curriculo` | `CurriculoController.index` | `pages/curriculo/index.ejs` | Vista general de PFGs, selección de carrera y listado de materias agrupadas por Trayecto y Tramo. |
| `POST` | `/curriculo/pfg` | `CurriculoController.crearPfg` | Redirect | Alta de nuevo Programa de Formación de Grado. |
| `POST` | `/curriculo/pfg/:id/editar` | `CurriculoController.editarPfg` | Redirect | Modificación de datos generales del PFG. |
| `POST` | `/curriculo/pfg/:id/toggle` | `CurriculoController.togglePfg` | Redirect | Habilitar o suspender un PFG. |
| `POST` | `/curriculo/unidades` | `CurriculoController.crearUnidad` | Redirect | Registro de nueva Unidad Curricular con desglose $H_T, H_P, H_C$, créditos y tipo de espacio. |
| `POST` | `/curriculo/unidades/:id/editar` | `CurriculoController.editarUnidad` | Redirect | Actualización de parámetros académicos de la materia. |
| `POST` | `/curriculo/unidades/:id/toggle` | `CurriculoController.toggleUnidad` | Redirect | Activar o inhabilitar una Unidad Curricular. |
| `GET` | `/curriculo/api/pfg/:id/unidades` | `CurriculoController.apiUnidades` | JSON | Endpoint reactivo para poblar selectores dependientes en apertura de secciones. |


---

## 3. Ejemplo de Contrato Controlador TypeScript

```typescript
// src/modules/horarios/controllers/HorariosController.ts
import { Request, Response } from 'express';
import { HorariosService } from '../services/HorariosService';

export class HorariosController {
  constructor(private horariosService: HorariosService) {}

  async validarDrop(req: Request, res: Response) {
    const { seccionId, dia, horaInicio, horaFin, espacioFisicoId } = req.body;
    
    const resultado = await this.horariosService.validarMovimiento({
      seccionId,
      dia,
      horaInicio,
      horaFin,
      espacioFisicoId
    });

    // Retorna fragmento HTML para inyección reactiva con HTMX
    return res.render('partials/drop-feedback', { resultado });
  }

  async moverBloque(req: Request, res: Response) {
    const { seccionId, horarioId, dia, horaInicio, horaFin, espacioFisicoId, justificacion } = req.body;
    const usuarioResponsable = req.session.usuario.email;

    const horarioActualizado = await this.horariosService.aplicarAjusteManual({
      seccionId,
      horarioId,
      dia,
      horaInicio,
      horaFin,
      espacioFisicoId,
      justificacion,
      usuarioResponsable
    });

    return res.render('partials/celda-horario', { bloque: horarioActualizado });
  }
}
```
