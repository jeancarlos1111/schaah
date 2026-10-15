# Spec 4: Rutas, Controladores y Vistas SSR (Express + EJS + HTMX)
**Sistema Automatizado para la Asignación de Horarios Académicos (SAHAD — UBV Eje Regional Kerepakupai Vena)**

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
| `GET` | `/` | `tablero` (`modules/tablero/TableroController`) | `pages/dashboard.ejs` | Métricas del período vigente (`buscarPeriodoVigente`: el más reciente en `PLANIFICACION`/`BORRADOR`, si no el `ACTIVO`): dedicaciones DE, secciones con docente y sobrecargas/déficits H-04/H-05 de `OfertaInconsistenciasService`. Para el coordinador cuentan solo sus programas; el docente recibe accesos a su horario y a `/mi-disponibilidad`. |
| `GET` | `/reportes` | `normativa` (`modules/normativa/NormativaController`) | `pages/normativa/index.ejs` | Normativa y Reportes: restricciones duras H-01..H-10 y blandas S-01..S-08, límites de `LIMITES_DEDICACION`, bloques oficiales en 12 h y enlaces de exportación del período vigente según el rol (`reportesDisponibles`). |
| `GET` | `/usuarios` | `UsuariosController.index` | `pages/usuarios/index.ejs` | Listado completo de usuarios, roles, buscador en tiempo real y modal de creación. |
| `POST` | `/usuarios` | `UsuariosController.crear` | Redirect | Registro de nueva cuenta con hash de contraseña. Para `COORDINADOR_PFG` exige al menos un valor en `programas` (ids de PFG, campo repetible). |
| `POST` | `/usuarios/:id/editar` | `UsuariosController.editar` | Redirect | Modificación de nombres, apellidos, rol RBAC y `programas` coordinados (reemplaza los vínculos `UsuarioPrograma`; se vacían si el rol deja de ser coordinador). |
| `POST` | `/usuarios/:id/reset-password` | `UsuariosController.resetPassword` | Redirect | Asignación de nueva contraseña cifrada. |
| `POST` | `/usuarios/:id/toggle` | `UsuariosController.toggleEstado` | Redirect | Activar o desactivar cuenta de usuario. |

### 2.2 Módulo de Docentes y Disponibilidad
| Método | Ruta | Controlador | Vista EJS | Descripción |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/docentes` | `DocentesController.index` | `pages/docentes/index.ejs` | Listado server-side con DataTable de profesores, filtros por dedicación, escalafón y adscripción territorial. |
| `GET` | `/mi-disponibilidad` | `DocentesController.miDisponibilidad` | Redirect | Redirección directa y segura a la matriz semanal del docente autenticado según su perfil de sesión. |
| `GET` | `/docentes/:id/disponibilidad` | `DocentesController.disponibilidad` | `pages/docentes/disponibilidad.ejs` | Matriz semanal interactiva de 48 celdas (Lunes a Sábado, 8 bloques). Ciclo de 4 estados (`NO`, `P1`, `P2`, `P3`) y acciones rápidas masivas. Selector `?periodoId=` con los períodos no cerrados; por defecto el más reciente en `PLANIFICACION`/`BORRADOR`, si no el `ACTIVO` (`elegirPeriodoDisponibilidad`). Permisos según `permisoDisponibilidad` (Spec 06, sección 5): el docente solo la suya; Administración y Dirección, la de cualquiera; el coordinador, la de docentes con asignaciones de sus programas en el período (403 en otro caso). A terceros se les muestra el campo obligatorio *Motivo del cambio*; todos ven el panel *Historial de cambios* (últimos 20 registros de `auditoria_disponibilidad`, fecha `dd/mm/aaaa hh:mm AM/PM`). |
| `POST` | `/docentes/:id/disponibilidad` | `DocentesController.guardarDisponibilidad` | Redirect `/docentes/:id/disponibilidad?periodoId=...&msg=...` | Persiste slots habilitados y prioridades en `profesor_disponibilidades` para el `periodoId` del formulario; rechaza un período cerrado o inexistente sin tocar datos. Exige `motivo` (mínimo 10 caracteres) a quien edita la de otro docente. Si hay cambios, reemplaza las franjas y registra `AuditoriaDisponibilidad` en la misma transacción (`msg`: *"... actualizada correctamente: 2 franjas agregadas."*); sin cambios no escribe nada (*"Sin cambios en la disponibilidad del período ...: no se registró nada."*). |
| `GET` | `/docentes/carga-consolidada` | `DocentesController.cargaConsolidada` | `pages/docentes/carga-consolidada.ejs` | Planilla oficial UBV (Docencia directa + proyecto/comunidad + asesoría + investigación/gestión). Auditoría H-04/H-05 y formato imprimible con firmas. |

### 2.3 Módulo de Espacios y Sedes
| Método | Ruta | Controlador | Vista EJS | Descripción |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/espacios` | `EspaciosController.index` | `pages/espacios/index.ejs` | Listado server-side con DataTable de aulas, laboratorios y catálogo de sedes/aldeas. El coordinador lo ve en solo lectura; todos los `POST` de esta tabla exigen ADMIN o DIRECTOR. |
| `POST` | `/espacios/aulas` | `EspaciosController.crearAula` | Redirect `/espacios` | Registro de aula/laboratorio con aforo, tipo y piso. |
| `POST` | `/espacios/aulas/:id/editar` | `EspaciosController.editarAula` | Redirect `/espacios` | Actualización de nombre, tipo, capacidad y piso del recinto. |
| `POST` | `/espacios/aulas/:id/toggle` | `EspaciosController.toggleAula` | Redirect `/espacios` | Habilitación o suspensión del espacio físico para el solver. |
| `POST` | `/espacios/sedes/nueva` | `EspaciosController.crearSede` | Redirect `/espacios?tab=sedes` | Registro de campus principal o Aldea Universitaria municipalizada. |
| `POST` | `/espacios/sedes/:id/editar` | `EspaciosController.editarSede` | Redirect `/espacios?tab=sedes` | Modificación de datos territoriales de la sede o aldea. |
| `POST` | `/espacios/sedes/:id/toggle` | `EspaciosController.toggleSede` | Redirect `/espacios?tab=sedes` | Habilitación o inhabilitación territorial de la sede. |

### 2.4 Módulo de Horarios y Motor de Optimización
| Método | Ruta | Controlador | Vista / Fragmento | Descripción |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/horarios` | `HorariosController.redirigirPeriodoActivo` | Redirect | Lleva a la matriz del período vigente; sin períodos abiertos vuelve a `/periodos` (planificación) o `/` (docente). El docente entra a su propio horario (`tipo=DOCENTE&id=<su profesorId>`) en solo consulta (`soloLectura`: sin solver, bandeja, arrastre ni desasignación). Los parámetros `msg` y `error` se conservan en la redirección. |
| `GET` | `/periodos/:id/horarios` | `HorariosController.matriz` | `pages/horarios/matriz.ejs` | Matriz semanal con selector de vista `?tipo=DOCENTE\|AULA\|SECCION\|GRUPO&id=...` (por Docente, por Aula, por Asignación UC o por Cohorte) y filtro `pfg`. La lista "Por Programar" muestra solo las asignaciones sin horario de la vista activa (`pendientesDeVista`): las del docente, la asignación, la cohorte o la sede del aula seleccionada. Para el `DOCENTE` (`soloSuHorario`) la vista queda fija en su propio horario: otra perspectiva u otro docente redirige con *"Solo puede consultar su propio horario."*, se ocultan pestañas, selector de docente y filtro P.F.G., y una cuenta sin ficha vinculada recibe 403. |
| `POST` | `/periodos/:id/horarios/validar-drop` | `HorariosController.validarDrop` | JSON | Validador instantáneo para Drag & Drop (H-01, H-02, H-03, H-06, H-07, H-08, H-09) contra los horarios de todos los programas. |
| `POST` | `/periodos/:id/horarios/mover` | `HorariosController.moverBloque` | JSON | Coloca o mueve un bloque. El servidor vuelve a ejecutar el validador: **409** `{ success: false, error, conflictos }` si hay una restricción dura; el bloque debe pertenecer a la asignación y la asignación al período. Proyecto comunitario se guarda sin aula. Registra auditoría con el correo de la sesión y la justificación. |
| `POST` | `/periodos/:id/horarios/eliminar` | `HorariosController.eliminarBloque` | JSON | Elimina un bloque del período y registra auditoría. |
| `GET` | `/periodos/:id/solver/diagnostico` | `SolverController.diagnostico` | JSON | Asignaciones pendientes y métricas (filtradas por los programas del coordinador), con `factible` y `avisos` de `diagnosticarFactibilidad`: docentes sin franjas declaradas, con menos franjas que bloques, y secciones sin aula de aforo suficiente en su sede. |
| `POST` | `/periodos/:id/solver/ejecutar` | `SolverController.ejecutar` | JSON | Ejecuta el motor (`motor: CP_SAT \| GENETICO`) sobre las pendientes de los programas del usuario; los horarios guardados de cualquier programa son restricciones fijas. `autoAplicar` guarda la propuesta. |
| `POST` | `/periodos/:id/solver/aplicar` | `SolverController.aplicar` | JSON | Guarda una propuesta; **403** si incluye asignaciones de otro período o de programas fuera del alcance (se rechaza completa). |

### 2.4.1 Módulo de Períodos, Cohortes y Asignaciones
| Método | Ruta | Controlador | Vista / Retorno | Descripción |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/periodos` | `PeriodosController.index` | `pages/periodos/index.ejs` | Listado de períodos académicos. El `DOCENTE` se redirige a `/horarios?msg=...` (aviso *"La gestión de períodos y secciones corresponde a la planificación; se muestra su horario."*; un `error` recibido se conserva en su lugar). |
| `POST` | `/periodos` | `PeriodosController.crearPeriodo` | Redirect | Alta de período (ADMIN, DIRECTOR). |
| `POST` | `/periodos/:id/estado` | `PeriodosController.cambiarEstado` | Redirect | Cambio de estado del período (ADMIN, DIRECTOR). |
| `GET` | `/periodos/:id/secciones` | `PeriodosController.secciones` | `pages/periodos/secciones.ejs` | DataTable server-side de asignaciones UC del período con filtros `pfgId`, `turno`, `grupoId`, `sedeId`, `docente` (`CON_DOCENTE`/`VACANTE`) y búsqueda `q`. Incluye un único modal "Asignar docente" alimentado por `docentesCarga` (JSON con la carga de cada docente calculada con `calcularCargaDocente`). El `DOCENTE` se redirige a `/periodos/:id/horarios` con el mismo aviso. |
| `POST` | `/periodos/:id/grupos` | `PeriodosController.crearGrupo` | Redirect | Alta de una Sección (Cohorte) `GrupoSeccion`. |
| `POST` | `/periodos/:id/secciones` | `PeriodosController.crearSeccion` | Redirect | Alta de una Asignación UC (RC-02) con horas de oferta opcionales. |
| `POST` | `/periodos/:id/secciones/:seccionId/asignar-profesor` | `PeriodosController.asignarDocente` | Redirect a `volver` | Asigna o cambia el docente. El campo `volver` conserva página y filtros; solo se aceptan rutas `/periodos/{id}/secciones[?…]` del mismo período (`urlRetornoSecciones`), cualquier otro valor cae en la ruta base. |
| `POST` | `/periodos/:id/secciones/:seccionId/eliminar` | `PeriodosController.eliminarSeccion` | Redirect | Elimina una asignación (ADMIN, DIRECTOR). |

### 2.4.2 Módulo de Oferta de Carga Horaria (Spec 10)
| Método | Ruta | Controlador | Vista / Salida | Descripción |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/periodos/:id/oferta` | `OfertaController.index` | `pages/oferta/index.ejs` | Cohortes y asignaciones del período con formulario de importación. |
| `GET` | `/periodos/:id/oferta/exportar.xlsx` | `OfertaController.exportar` | Archivo `.xlsx` | Exporta la oferta en el formato institucional de 29 columnas. |
| `POST` | `/periodos/:id/oferta/importar` | `OfertaController.importar` | Redirect a vista previa | Recibe el `.xlsx` (multer en memoria, máx. 15 MB) y genera el plan sin escribir en la base. |
| `GET` | `/periodos/:id/oferta/vista-previa` | `OfertaController.vistaPrevia` | `pages/oferta/preview.ejs` | Resumen, errores, avisos, sobrecargas y dedicaciones contradictorias del plan. |
| `POST` | `/periodos/:id/oferta/confirmar` | `OfertaController.confirmar` | Redirect a inconsistencias | Respalda la base (SQLite) y aplica el plan en una transacción. |
| `POST` | `/periodos/:id/oferta/cancelar` | `OfertaController.cancelar` | Redirect | Descarta la vista previa. |
| `GET` | `/periodos/:id/oferta/inconsistencias` | `OfertaController.inconsistencias` | `pages/oferta/inconsistencias.ejs` | Reporte por pestañas `?tipo=` con búsqueda, orden y paginación en servidor (Spec 07). |
| `GET` | `/periodos/:id/oferta/inconsistencias.xlsx` | `OfertaController.exportarInconsistencias` | Archivo `.xlsx` | Libro con hoja RESUMEN y una hoja por tipo de inconsistencia. |
| `POST` | `/periodos/:id/oferta/unidades/:unidadId/codigo` | `OfertaController.confirmarCodigoUnidad` | Redirect | Confirma o corrige un código provisional (RC-01, RC-08). |

### 2.4.3 Ayuda
| Método | Ruta | Vista | Descripción |
| :--- | :--- | :--- | :--- |
| `GET` | `/ayuda/manual-usuario` | `pages/ayuda/manual-usuario.ejs` | Manual de usuario en línea. |
| `GET` | `/ayuda/manual-tecnico` | `pages/ayuda/manual-tecnico.ejs` | Manual técnico en línea. |

### 2.5 Módulo de Exportación y Conectores
| Método | Ruta | Controlador | Salida | Descripción |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/periodos/:id/exportar/pdf` | `ReportesController.exportarPDF` | Stream PDF | Descarga formato oficial de horario por sección y planilla docente. |
| `GET` | `/periodos/:id/exportar/sur-ubv` | `ReportesController.exportarSUR` | Archivo CSV/JSON | Exportación compatible con la base de datos de SUR@UBV. |

### 2.6 Módulo de Mallas Curriculares y PFG
| Método | Ruta | Controlador | Vista / Fragmento | Descripción |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/curriculo` | `CurriculoController.index` | `pages/curriculo/index.ejs` | Vista general de PFGs, selección de carrera y listado server-side de materias con filtros de Trayecto (`0`–`5` o `ninguno`), Tramo (`0`–`10`) y espacio (Spec 09). |
| `POST` | `/curriculo/pfg` | `CurriculoController.crearPfg` | Redirect | Alta de nuevo Programa de Formación de Grado. |
| `POST` | `/curriculo/pfg/:id/editar` | `CurriculoController.editarPfg` | Redirect | Modificación de datos generales del PFG. |
| `POST` | `/curriculo/pfg/:id/toggle` | `CurriculoController.togglePfg` | Redirect | Habilitar o suspender un PFG. |
| `POST` | `/curriculo/unidades` | `CurriculoController.crearUnidad` | Redirect | Registro de nueva Unidad Curricular con desglose $H_T, H_P, H_C$, créditos y tipo de espacio. |
| `POST` | `/curriculo/unidades/:id/editar` | `CurriculoController.editarUnidad` | Redirect | Actualización de parámetros académicos, ubicación y prelaciones de la materia (RC-06, RC-07; conserva prelaciones si no llega `prelacionesEnviadas=1`). |
| `POST` | `/curriculo/unidades/:id/toggle` | `CurriculoController.toggleUnidad` | Redirect | Activar o inhabilitar una Unidad Curricular. |
| `GET` | `/curriculo/api/pfg/:id/unidades` | `CurriculoController.apiUnidades` | JSON | Endpoint reactivo para poblar selectores dependientes en apertura de secciones. |


---

### 2.7 Alcance por programa y códigos de respuesta

Para `COORDINADOR_PFG`, las rutas de `/curriculo/unidades*`, `/periodos/:id/secciones*`, `/periodos/:id/grupos`, `/periodos/:id/horarios/*`, `/periodos/:id/solver/*`, `/periodos/:id/oferta*` y `/docentes/carga-consolidada` se limitan a los programas vinculados en `UsuarioPrograma` (Spec 06, sección 4):

- Los listados y contadores solo incluyen esos programas; un filtro `pfgId`/`pfg` ajeno se ignora.
- Escribir sobre una unidad, asignación, cohorte o bloque de otro programa responde **403**: JSON `{ ok: false, error: "Acceso denegado: ..." }` cuando la petición acepta o envía JSON, o la página `pages/error` en otro caso.
- `409` se reserva para conflictos de restricciones duras al colocar o mover bloques.

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
