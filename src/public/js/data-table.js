/**
 * SAHAD - Componente Reutilizable DataTable (Vanilla JS)
 * Implementa: Búsqueda en vivo, Filtros múltiples, Paginación, Ordenamiento y Estado Vacío.
 * Cumple: specs/07-ui-components-spec.md
 */

class SahadDataTable {
  constructor(options = {}) {
    this.wrapper = typeof options.wrapper === 'string' 
      ? document.querySelector(options.wrapper) 
      : (options.wrapper || document.getElementById(options.wrapperId));

    if (!this.wrapper) return;

    // Configuración y selectores
    this.table = this.wrapper.querySelector(options.tableSelector || '.data-table-target') || this.wrapper.querySelector('table');
    if (!this.table) return;

    this.searchInput = this.wrapper.querySelector(options.searchSelector || '.data-table-search');
    this.filterSelects = Array.from(this.wrapper.querySelectorAll(options.filterSelector || '.data-table-filter'));
    this.pageSizeSelect = this.wrapper.querySelector(options.pageSizeSelector || '.data-table-size');
    this.paginationContainer = this.wrapper.querySelector(options.paginationSelector || '.data-table-pagination');
    this.infoContainer = this.wrapper.querySelector(options.infoSelector || '.data-table-info');
    this.resetBtn = this.wrapper.querySelector(options.resetBtnSelector || '.data-table-reset');

    // Estado interno
    this.currentPage = 1;
    this.pageSize = this.pageSizeSelect ? parseInt(this.pageSizeSelect.value, 10) : (options.defaultPageSize || 10);
    this.currentSort = { colIndex: null, direction: 'none' };
    this.searchTerm = '';
    this.activeFilters = {};

    // Almacén de filas
    this.tbody = this.table.querySelector('tbody');
    this.originalRows = Array.from(this.tbody.querySelectorAll('tr:not(.data-table-empty-row)'));
    this.filteredRows = [...this.originalRows];

    this.init();
  }

  init() {
    this.bindSearch();
    this.bindFilters();
    this.bindPageSize();
    this.bindSorting();
    this.bindReset();

    this.applyAll();
  }

  // 1. Búsqueda en tiempo real con Debounce
  bindSearch() {
    if (!this.searchInput) return;

    let debounceTimer;
    this.searchInput.addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        this.searchTerm = e.target.value.trim().toLowerCase();
        this.currentPage = 1;
        this.applyAll();
      }, 150);
    });
  }

  // 2. Filtros por atributos de datos (data-filter-col)
  bindFilters() {
    this.filterSelects.forEach((select) => {
      const colKey = select.getAttribute('data-filter-col');
      if (!colKey) return;

      select.addEventListener('change', () => {
        const val = select.value.trim();
        if (val) {
          this.activeFilters[colKey] = val.toLowerCase();
        } else {
          delete this.activeFilters[colKey];
        }
        this.currentPage = 1;
        this.applyAll();
      });
    });
  }

  // 3. Selector de filas por página (5, 10, 25, 50)
  bindPageSize() {
    if (!this.pageSizeSelect) return;

    this.pageSizeSelect.addEventListener('change', () => {
      this.pageSize = parseInt(this.pageSizeSelect.value, 10) || 10;
      this.currentPage = 1;
      this.render();
    });
  }

  // 4. Ordenamiento por clic en encabezados <th>
  bindSorting() {
    const headers = this.table.querySelectorAll('thead th.sortable, thead th[data-sort]');
    headers.forEach((th, index) => {
      th.style.cursor = 'pointer';
      th.setAttribute('title', 'Clic para ordenar');

      th.addEventListener('click', () => {
        let newDir = 'asc';
        if (this.currentSort.colIndex === index) {
          newDir = this.currentSort.direction === 'asc' ? 'desc' : 'asc';
        }

        this.currentSort = { colIndex: index, direction: newDir };
        
        // Actualizar indicadores visuales
        headers.forEach((h, idx) => {
          h.classList.remove('sort-asc', 'sort-desc');
          if (idx === index) {
            h.classList.add(newDir === 'asc' ? 'sort-asc' : 'sort-desc');
          }
        });

        this.sortRows(index, newDir);
        this.render();
      });
    });
  }

  sortRows(colIndex, direction) {
    this.filteredRows.sort((rowA, rowB) => {
      const cellA = rowA.children[colIndex];
      const cellB = rowB.children[colIndex];

      const valA = (cellA ? (cellA.getAttribute('data-sort-val') || cellA.innerText) : '').trim().toLowerCase();
      const valB = (cellB ? (cellB.getAttribute('data-sort-val') || cellB.innerText) : '').trim().toLowerCase();

      // Comparación numérica si aplica
      const numA = parseFloat(valA);
      const numB = parseFloat(valB);
      if (!isNaN(numA) && !isNaN(numB)) {
        return direction === 'asc' ? numA - numB : numB - numA;
      }

      return direction === 'asc' 
        ? valA.localeCompare(valB, 'es', { sensitivity: 'base' })
        : valB.localeCompare(valA, 'es', { sensitivity: 'base' });
    });
  }

  // 5. Botón Reset
  bindReset() {
    if (!this.resetBtn) return;

    this.resetBtn.addEventListener('click', (e) => {
      e.preventDefault();
      this.reset();
    });
  }

  reset() {
    if (this.searchInput) this.searchInput.value = '';
    this.searchTerm = '';

    this.filterSelects.forEach(s => s.value = '');
    this.activeFilters = {};

    this.currentPage = 1;
    this.applyAll();
  }

  // Pipeline principal: Filtrar + Paginar + Renderizar
  applyAll() {
    this.filteredRows = this.originalRows.filter((row) => {
      // Coincidencia con búsqueda general
      if (this.searchTerm) {
        const textContent = row.innerText.toLowerCase();
        if (!textContent.includes(this.searchTerm)) return false;
      }

      // Coincidencia con filtros select
      for (const [colKey, filterVal] of Object.entries(this.activeFilters)) {
        const rowVal = (row.getAttribute(`data-${colKey}`) || '').toLowerCase();
        if (rowVal !== filterVal) {
          // Búsqueda alternativa en celdas si no está en data-attribute
          const cellVal = row.innerText.toLowerCase();
          if (!cellVal.includes(filterVal)) return false;
        }
      }

      return true;
    });

    // Re-aplicar orden actual si está activo
    if (this.currentSort.colIndex !== null) {
      this.sortRows(this.currentSort.colIndex, this.currentSort.direction);
    }

    // Mostrar/ocultar botón de reset
    if (this.resetBtn) {
      const hasActiveFilters = this.searchTerm !== '' || Object.keys(this.activeFilters).length > 0;
      this.resetBtn.classList.toggle('uk-hidden', !hasActiveFilters);
    }

    this.render();
  }

  render() {
    const totalFiltered = this.filteredRows.length;
    const totalPages = Math.ceil(totalFiltered / this.pageSize) || 1;

    if (this.currentPage > totalPages) {
      this.currentPage = totalPages;
    }

    const startIndex = (this.currentPage - 1) * this.pageSize;
    const endIndex = Math.min(startIndex + this.pageSize, totalFiltered);

    // Ocultar todas las filas originales primero
    this.originalRows.forEach(row => row.style.display = 'none');

    // Quitar fila vacía si existía
    const existingEmpty = this.tbody.querySelector('.data-table-empty-row');
    if (existingEmpty) existingEmpty.remove();

    if (totalFiltered === 0) {
      // Inyectar estado vacío
      const colSpan = this.table.querySelectorAll('thead th').length || 6;
      const emptyTr = document.createElement('tr');
      emptyTr.className = 'data-table-empty-row';
      emptyTr.innerHTML = `
        <td colspan="${colSpan}" class="empty-state-cell uk-text-center uk-padding">
          <div class="empty-state-inner">
            <span uk-icon="icon: search; ratio: 1.5" class="empty-state-icon uk-margin-small-bottom"></span>
            <div class="empty-state-title">No se encontraron resultados</div>
            <div class="empty-state-subtitle uk-text-muted uk-text-small uk-margin-xsmall-top">
              No hay registros que coincidan con los criterios de búsqueda o filtros seleccionados.
            </div>
            <button type="button" class="btn-clean-secondary btn-sm uk-margin-small-top" onclick="this.closest('.data-table-wrapper').querySelector('.data-table-reset')?.click()">
              Restablecer filtros
            </button>
          </div>
        </td>
      `;
      this.tbody.appendChild(emptyTr);
    } else {
      // Mostrar y ordenar exactamente el slice de la página actual
      for (let i = startIndex; i < endIndex; i++) {
        const row = this.filteredRows[i];
        row.style.display = '';
        this.tbody.appendChild(row); // Mantiene orden en el DOM
      }
    }

    this.renderInfo(startIndex, endIndex, totalFiltered);
    this.renderPagination(totalPages);
  }

  // Información textual
  renderInfo(start, end, total) {
    if (!this.infoContainer) return;

    const totalAll = this.originalRows.length;
    if (total === 0) {
      this.infoContainer.innerHTML = `Mostrando <strong>0</strong> registros`;
      return;
    }

    const displayStart = start + 1;
    let html = `Mostrando <strong class="text-white">${displayStart}</strong> a <strong class="text-white">${end}</strong> de <strong class="text-white">${total}</strong>`;
    if (total < totalAll) {
      html += ` <span class="uk-text-muted">(filtrados de ${totalAll} totales)</span>`;
    } else {
      html += ` <span class="uk-text-muted">registros</span>`;
    }
    this.infoContainer.innerHTML = html;
  }

  // Controles de Paginación UIkit / Clean Enterprise
  renderPagination(totalPages) {
    if (!this.paginationContainer) return;

    if (totalPages <= 1) {
      this.paginationContainer.innerHTML = '';
      return;
    }

    let html = `<ul class="clean-pagination-list">`;

    // Botón Anterior
    const prevDisabled = this.currentPage === 1 ? 'disabled' : '';
    html += `
      <li>
        <button type="button" class="page-nav-btn ${prevDisabled}" data-page="${this.currentPage - 1}" ${prevDisabled ? 'disabled' : ''}>
          <span uk-icon="icon: chevron-left; ratio: 0.8"></span>
          <span>Anterior</span>
        </button>
      </li>
    `;

    // Generar botones numéricos con rango inteligente
    const maxVisibleButtons = 5;
    let startPage = Math.max(1, this.currentPage - 2);
    let endPage = Math.min(totalPages, startPage + maxVisibleButtons - 1);
    if (endPage - startPage < maxVisibleButtons - 1) {
      startPage = Math.max(1, endPage - maxVisibleButtons + 1);
    }

    if (startPage > 1) {
      html += `<li><button type="button" class="page-number-btn" data-page="1">1</button></li>`;
      if (startPage > 2) {
        html += `<li class="page-ellipsis"><span>…</span></li>`;
      }
    }

    for (let p = startPage; p <= endPage; p++) {
      const activeClass = p === this.currentPage ? 'is-active' : '';
      html += `<li><button type="button" class="page-number-btn ${activeClass}" data-page="${p}">${p}</button></li>`;
    }

    if (endPage < totalPages) {
      if (endPage < totalPages - 1) {
        html += `<li class="page-ellipsis"><span>…</span></li>`;
      }
      html += `<li><button type="button" class="page-number-btn" data-page="${totalPages}">${totalPages}</button></li>`;
    }

    // Botón Siguiente
    const nextDisabled = this.currentPage === totalPages ? 'disabled' : '';
    html += `
      <li>
        <button type="button" class="page-nav-btn ${nextDisabled}" data-page="${this.currentPage + 1}" ${nextDisabled ? 'disabled' : ''}>
          <span>Siguiente</span>
          <span uk-icon="icon: chevron-right; ratio: 0.8"></span>
        </button>
      </li>
    `;

    html += `</ul>`;
    this.paginationContainer.innerHTML = html;

    // Asignar eventos de clic a los botones de página
    this.paginationContainer.querySelectorAll('button[data-page]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const targetPage = parseInt(btn.getAttribute('data-page'), 10);
        if (targetPage && targetPage !== this.currentPage && targetPage >= 1 && targetPage <= totalPages) {
          this.currentPage = targetPage;
          this.render();
        }
      });
    });
  }
}

// Auto-inicialización global para elementos con [data-datatable="true"]
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-datatable="true"]').forEach((wrapper) => {
    new SahadDataTable({ wrapper });
  });
});

// Exponer globalmente en window (Canónico: SahadDataTable, Alias: SchaahDataTable)
window.SahadDataTable = SahadDataTable;
window.SchaahDataTable = SahadDataTable;
const SchaahDataTable = SahadDataTable;
