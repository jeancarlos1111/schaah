# SAHAD - Especificación de Componentes de Interfaz de Usuario
## Spec 07: Componente Reutilizable DataTable (Paginación, Filtro, Búsqueda y Ordenación en Servidor)

### 1. Principio Arquitectónico: Paginación en Servidor (Server-Side)
Por mandato de escalabilidad institucional de la UBV, **ninguna vista del sistema debe cargar la totalidad de registros en el DOM del cliente**. 
Todas las tablas maestras (`/usuarios`, `/docentes`, `/espacios`, `/secciones`, `/horarios`) deben ejecutar:
1. **Paginación en Servidor**: Consultas a la base de datos con `skip` y `take` de Prisma ORM.
2. **Filtrado en Servidor**: Cláusula `where` dinámica con operadores SQL/Prisma en índices relacionales.
3. **Búsqueda en Servidor**: Cláusula `OR: [ { campo: { contains: q } } ]` evaluada en el motor de persistencia.
4. **Conteo en Servidor**: `prisma.modelo.count({ where })` para calcular el total de páginas sin transportar filas redundantes por la red.
5. **Transición Reactiva HTMX**: Actualización de fragmentos mediante `hx-get`, `hx-target`, `hx-select` y `hx-push-url` sin recarga completa de página.

---

### 2. Parámetros de Consulta Estandarizados (Query Params)

Cualquier controlador que soporte listas tabulares debe procesar los siguientes parámetros HTTP GET:

| Parámetro | Tipo | Default | Descripción |
| :--- | :--- | :--- | :--- |
| `page` | `number` | `1` | Índice de página actual (base 1). |
| `limit` | `number` | `10` | Cantidad de registros por página (`5`, `10`, `25`, `50`). |
| `q` | `string` | `""` | Texto de búsqueda para coincidencias relacionales. |
| `sortBy` | `string` | `"createdAt"` | Nombre de la columna de ordenación permitida. |
| `sortDir` | `"asc" \| "desc"` | `"desc"` | Dirección del ordenamiento. |
| `[filtro]` | `string` | `undefined` | Filtros por catálogo (ej. `rol`, `estado`, `dedicacion`, `sedeId`). |

---

### 3. Contrato de Respuesta del Controlador (Express -> EJS)

El controlador debe suministrar al renderizador de vistas los siguientes objetos:

```typescript
interface PaginatedViewModel<T> {
  registros: T[];               // Exactamente 'limit' filas traídas por Prisma (skip/take)
  pagination: {
    page: number;              // Página actual
    limit: number;             // Tamaño de página
    total: number;             // Total de filas que cumplen el filtro
    totalPages: number;        // Total de páginas calculadas
    start: number;             // Índice inicial mostrado (ej. 1)
    end: number;               // Índice final mostrado (ej. 10)
    hasNext: boolean;          // ¿Existe página siguiente?
    hasPrev: boolean;          // ¿Existe página anterior?
  };
  filters: {
    q: string;
    sortBy: string;
    sortDir: 'asc' | 'desc';
    [key: string]: any;
  };
  stats: {
    total: number;             // Conteo total histórico no filtrado para métricas Bento
    [key: string]: number;
  };
}
```

---

### 4. Estructura de Marcado del Componente en Vistas EJS

```html
<div class="clean-panel data-table-wrapper" id="modulo-datatable-wrapper">
  
  <!-- Formulario de Filtros con Disparador HTMX -->
  <form 
    id="modulo-filter-form" 
    action="/modulo" 
    method="GET" 
    hx-get="/modulo" 
    hx-target="#modulo-datatable-wrapper" 
    hx-select="#modulo-datatable-wrapper" 
    hx-swap="outerHTML" 
    hx-push-url="true"
    class="table-toolbar uk-flex uk-flex-between uk-flex-middle uk-flex-wrap gap-2"
  >
    <input type="hidden" name="page" value="1" id="filter-page-input" />
    <input type="hidden" name="sortBy" value="<%= filters.sortBy %>" />
    <input type="hidden" name="sortDir" value="<%= filters.sortDir %>" />

    <div class="table-toolbar-left uk-flex uk-flex-middle uk-flex-wrap gap-2">
      <!-- Búsqueda con debounce en HTMX -->
      <div class="table-search-box">
        <span uk-icon="icon: search; ratio: 0.8" class="search-icon"></span>
        <input 
          type="text" 
          name="q" 
          value="<%= filters.q %>"
          class="search-input" 
          placeholder="Buscar..."
          hx-trigger="input changed delay:350ms, search"
        />
      </div>

      <!-- Filtros de servidor -->
      <select name="rol" class="table-filter-select" onchange="this.form.requestSubmit()">
        <option value="">Todos</option>
      </select>

      <% if (filters.q || filters.rol) { %>
        <a href="/modulo" class="btn-clean-ghost" hx-get="/modulo" hx-target="#modulo-datatable-wrapper" hx-select="#modulo-datatable-wrapper" hx-swap="outerHTML" hx-push-url="true">
          Limpiar
        </a>
      <% } %>
    </div>

    <!-- Selector de Filas por Página -->
    <div class="table-toolbar-right uk-flex uk-flex-middle gap-2">
      <span class="uk-text-muted uk-text-small">Mostrar:</span>
      <select name="limit" class="table-page-size-select" onchange="this.form.requestSubmit()">
        <option value="5" <%= pagination.limit === 5 ? 'selected' : '' %>>5</option>
        <option value="10" <%= pagination.limit === 10 ? 'selected' : '' %>>10</option>
        <option value="25" <%= pagination.limit === 25 ? 'selected' : '' %>>25</option>
      </select>
    </div>
  </form>

  <!-- Tabla de Datos -->
  <div class="uk-overflow-auto uk-margin-small-top">
    <table class="clean-table">
      <thead>
        <!-- Cabeceras con enlaces de ordenamiento al servidor -->
      </thead>
      <tbody>
        <!-- Iteración sobre exactamente pagination.limit filas -->
      </tbody>
    </table>
  </div>

  <!-- Paginador del Servidor -->
  <div class="table-footer">
    <div class="data-table-info uk-text-muted uk-text-small">
      Mostrando <strong><%= pagination.start %></strong> a <strong><%= pagination.end %></strong> de <strong><%= pagination.total %></strong> registros
    </div>
    <div class="clean-pagination">
      <!-- Enlaces numéricos hacia ?page=X con hx-get -->
    </div>
  </div>
</div>
```

---

### 5. Criterios de Aceptación (DoD)
1. **Memoria O(limit)**: El servidor y el cliente transfieren y renderizan exclusivamente el fragmento solicitado por la página actual (`limit`).
2. **Persistencia de URL**: Cada cambio de página, filtro u ordenamiento actualiza los parámetros en la URL vía `hx-push-url="true"`, permitiendo recargas y enlaces directos.
3. **Métricas Bento desacopladas**: Las tarjetas superiores de conteo general reflejan los totales globales de la base de datos sin afectarse por la paginación de la tabla.
