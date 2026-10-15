import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { ChildProcess, execFileSync, spawn } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { RUTA_BASE_DEMO, verificarDestinoDemo } from '../core/database/demoManual';

/**
 * Capturas de pantalla del manual de usuario (docs/img/manual/*.png).
 *
 * Requisitos:
 *   1. pnpm manual:demo                                   (base prisma/demo-manual.db recién creada)
 *   2. DATABASE_URL="file:./demo-manual.db" PORT=3999 pnpm dev
 *   3. pnpm manual:capturas
 *
 * Recorre el sistema con las cuentas de prueba de cada rol en Chrome sin interfaz (CDP).
 * Ejecuta y aplica el solver del PFG-INFO, por lo que solo se ejecuta contra la base de
 * demostración: antes de escribir, verifica que el servidor muestre las aulas AUL-DEMO.
 */

const URL_BASE = process.env.SAHAD_URL ?? 'http://localhost:3999';
const CHROME = process.env.CHROME_BIN ?? 'google-chrome';
const CLAVE = process.env.SAHAD_CLAVE_DEMO ?? 'ubv2026';
const SALIDA = path.resolve(__dirname, '../../docs/img/manual');
const ANCHO = 1440;
const ALTO = 900;

const CUENTAS = {
  administrador: 'admin@ubv.edu.ve',
  director: 'director.academico@ubv.edu.ve',
  coordinador: 'coord.informatica@ubv.edu.ve',
  docente: 'carlos.gomez@ubv.edu.ve',
};

type Mensaje = { id?: number; method?: string; params?: any; result?: any; error?: { message: string } };

class ClienteCdp {
  private secuencia = 0;
  private pendientes = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  private oyentes = new Set<(m: Mensaje) => void>();

  private constructor(private ws: WebSocket) {
    ws.addEventListener('message', (evento) => {
      const mensaje: Mensaje = JSON.parse(String(evento.data));
      if (mensaje.id !== undefined) {
        const pendiente = this.pendientes.get(mensaje.id);
        this.pendientes.delete(mensaje.id);
        if (mensaje.error) pendiente?.reject(new Error(mensaje.error.message));
        else pendiente?.resolve(mensaje.result);
      } else {
        this.oyentes.forEach((oyente) => oyente(mensaje));
      }
    });
  }

  static conectar(url: string): Promise<ClienteCdp> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      ws.addEventListener('open', () => resolve(new ClienteCdp(ws)));
      ws.addEventListener('error', () => reject(new Error(`No se pudo conectar a ${url}`)));
    });
  }

  enviar<T = any>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const id = ++this.secuencia;
    return new Promise((resolve, reject) => {
      this.pendientes.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  esperarEvento(method: string, timeoutMs = 30000): Promise<any> {
    return new Promise((resolve, reject) => {
      const temporizador = setTimeout(() => {
        this.oyentes.delete(oyente);
        reject(new Error(`Tiempo agotado esperando ${method}`));
      }, timeoutMs);
      const oyente = (m: Mensaje) => {
        if (m.method !== method) return;
        clearTimeout(temporizador);
        this.oyentes.delete(oyente);
        resolve(m.params);
      };
      this.oyentes.add(oyente);
    });
  }

  cerrar() {
    this.ws.close();
  }
}

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function lanzarChrome(perfil: string): Promise<{ proceso: ChildProcess; puerto: number }> {
  const proceso = spawn(CHROME, [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${perfil}`,
    `--window-size=${ANCHO},${ALTO}`,
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    'about:blank',
  ]);
  const puerto = await new Promise<number>((resolve, reject) => {
    const temporizador = setTimeout(() => reject(new Error('Chrome no expuso el puerto de depuración.')), 20000);
    proceso.stderr?.on('data', (fragmento: Buffer) => {
      const coincidencia = /DevTools listening on ws:\/\/[^:]+:(\d+)\//.exec(fragmento.toString());
      if (coincidencia) {
        clearTimeout(temporizador);
        resolve(Number(coincidencia[1]));
      }
    });
    proceso.on('exit', (codigo) => reject(new Error(`Chrome terminó con código ${codigo}.`)));
  });
  return { proceso, puerto };
}

class Navegador {
  private constructor(private cdp: ClienteCdp) {}

  static async abrir(puerto: number): Promise<Navegador> {
    const respuesta = await fetch(`http://127.0.0.1:${puerto}/json/list`);
    const objetivos = (await respuesta.json()) as { type: string; webSocketDebuggerUrl: string }[];
    const pagina = objetivos.find((o) => o.type === 'page');
    if (!pagina) throw new Error('Chrome no tiene una pestaña abierta.');
    const cdp = await ClienteCdp.conectar(pagina.webSocketDebuggerUrl);
    await cdp.enviar('Page.enable');
    await cdp.enviar('Runtime.enable');
    // Los diálogos nativos (confirm/alert) bloquearían la página sin interfaz
    await cdp.enviar('Page.addScriptToEvaluateOnNewDocument', {
      source: 'window.confirm = () => true; window.alert = (m) => console.warn("[alert]", m);',
    });
    const navegador = new Navegador(cdp);
    await navegador.fijarAlto(ALTO);
    return navegador;
  }

  async fijarAlto(alto: number) {
    await this.cdp.enviar('Emulation.setDeviceMetricsOverride', {
      width: ANCHO,
      height: alto,
      deviceScaleFactor: 1,
      mobile: false,
    });
  }

  async ir(ruta: string) {
    const carga = this.cdp.esperarEvento('Page.loadEventFired', 60000);
    await this.cdp.enviar('Page.navigate', { url: URL_BASE + ruta });
    await carga;
    await pausa(700);
  }

  async evaluar<T = any>(expresion: string): Promise<T> {
    const respuesta = await this.cdp.enviar('Runtime.evaluate', {
      expression: expresion,
      awaitPromise: true,
      returnByValue: true,
    });
    if (respuesta.exceptionDetails) {
      const detalle = respuesta.exceptionDetails.exception?.description ?? respuesta.exceptionDetails.text;
      throw new Error(`Error evaluando en la página: ${detalle}`);
    }
    return respuesta.result.value as T;
  }

  async esperar(condicion: string, timeoutMs = 30000) {
    const limite = Date.now() + timeoutMs;
    while (Date.now() < limite) {
      if (await this.evaluar<boolean>(`Boolean(${condicion})`)) return;
      await pausa(250);
    }
    throw new Error(`Tiempo agotado esperando: ${condicion}`);
  }

  async iniciarSesion(email: string) {
    await this.ir('/logout');
    const destino = await this.evaluar<string>(`
      fetch('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ email: ${JSON.stringify(email)}, password: ${JSON.stringify(CLAVE)} }),
      }).then((r) => r.url)
    `);
    if (destino.endsWith('/login')) throw new Error(`No se pudo iniciar sesión como ${email}.`);
  }

  async abrirModal(id: string) {
    await this.evaluar(`UIkit.modal('#${id}').show()`);
    await this.esperar(`document.querySelector('#${id}').classList.contains('uk-open')`);
    await pausa(600);
  }

  async cerrarModales() {
    await this.evaluar(`document.querySelectorAll('.uk-modal.uk-open').forEach((m) => UIkit.modal(m).hide())`);
    await pausa(500);
  }

  private async guardar(nombre: string, clip?: { x: number; y: number; width: number; height: number }) {
    const { data } = await this.cdp.enviar<{ data: string }>('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
      ...(clip ? { clip: { ...clip, scale: 1 } } : {}),
    });
    writeFileSync(path.join(SALIDA, `${nombre}.png`), Buffer.from(data, 'base64'));
    console.log(`[CAPTURAS] ${nombre}.png`);
  }

  /** Ventana visible; con `altoMax` se amplía la ventana hasta mostrar la página completa (con tope). */
  async capturarPagina(nombre: string, altoMax = ALTO) {
    await this.evaluar('window.scrollTo(0, 0)');
    const altoPagina = await this.evaluar<number>('document.documentElement.scrollHeight');
    const alto = Math.min(Math.max(altoPagina, ALTO), altoMax);
    if (alto !== ALTO) {
      await this.fijarAlto(alto);
      await pausa(400);
    }
    await this.guardar(nombre);
    if (alto !== ALTO) await this.fijarAlto(ALTO);
  }

  /** Recorte de un elemento con margen; si no cabe en la ventana, la ventana se alarga. */
  async capturarElemento(nombre: string, selector: string, margen = 12) {
    const medir = () =>
      this.evaluar<{ x: number; y: number; w: number; h: number } | null>(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.left, y: r.top, w: r.width, h: r.height };
      })()`);
    let rect = await medir();
    if (!rect) throw new Error(`No existe el elemento ${selector}`);
    const necesario = Math.ceil(rect.y + rect.h + margen);
    const ampliar = necesario > ALTO;
    if (ampliar) {
      await this.fijarAlto(necesario + 40);
      await pausa(500);
      rect = (await medir())!;
    }
    const x = Math.max(0, rect.x - margen);
    const y = Math.max(0, rect.y - margen);
    await this.guardar(nombre, {
      x,
      y,
      width: Math.min(ANCHO - x, rect.w + margen * 2),
      height: rect.h + margen * 2,
    });
    if (ampliar) await this.fijarAlto(ALTO);
  }

  /** Genera el PDF de la matriz sin descargarlo y lo devuelve en base64. */
  async pdfMatriz(): Promise<string> {
    await this.esperar('window.jspdf && window.jspdf.jsPDF && window.jspdf.jsPDF.API.autoTable');
    return this.evaluar<string>(`(() => {
      const api = window.jspdf.jsPDF.API;
      let salida = null;
      api.save = function () { salida = this.output('datauristring'); return this; };
      exportarHorarioPDF();
      return salida.split(',')[1];
    })()`);
  }

  cerrar() {
    this.cdp.cerrar();
  }
}

interface Ids {
  periodoId: string;
  pfgId: string;
  docenteId: string;
  /** Docente del programa con más secciones, para la perspectiva por docente. */
  docenteCargaId: string;
  grupoId: string;
  aulaId: string;
}

async function cargarIds(): Promise<Ids> {
  const url = process.env.SAHAD_DEMO_URL ?? `file:${RUTA_BASE_DEMO}`;
  const db = new PrismaClient({ datasourceUrl: `file:${verificarDestinoDemo(url, process.env.DATABASE_URL)}` });
  try {
    const periodo = await db.periodoAcademico.findUniqueOrThrow({ where: { codigo: '2026-II' } });
    const pfg = await db.programaFormacion.findUniqueOrThrow({ where: { codigo: 'PFG-INFO' } });
    const usuario = await db.usuario.findUniqueOrThrow({ where: { email: CUENTAS.docente } });
    const grupo = await db.grupoSeccion.findFirstOrThrow({
      where: { periodoId: periodo.id, pfgId: pfg.id },
      orderBy: { codigoNormalizado: 'asc' },
    });
    const aula = await db.espacioFisico.findFirstOrThrow({
      where: { sedeId: grupo.sedeId, tipo: 'AULA_TEORICA', activo: true },
      orderBy: { codigo: 'asc' },
    });
    const [conMasCarga] = await db.seccion.groupBy({
      by: ['profesorId'],
      where: { periodoId: periodo.id, unidadCurricular: { pfgId: pfg.id }, profesorId: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { profesorId: 'desc' } },
      take: 1,
    });
    const horarios = await db.horarioSeccion.count({ where: { seccion: { periodoId: periodo.id } } });
    if (horarios > 0) {
      throw new Error('La base de demostración ya tiene horarios en 2026-II: vuelva a crearla con pnpm manual:demo.');
    }
    return {
      periodoId: periodo.id,
      pfgId: pfg.id,
      docenteId: usuario.profesorId!,
      docenteCargaId: conMasCarga.profesorId!,
      grupoId: grupo.id,
      aulaId: aula.id,
    };
  } finally {
    await db.$disconnect();
  }
}

function libroOferta(): string | null {
  if (process.env.SAHAD_LIBRO_OFERTA) return process.env.SAHAD_LIBRO_OFERTA;
  const raiz = path.resolve(__dirname, '../..');
  const libro = readdirSync(raiz).find((f) => /^CONSOLIDADO.*\.xlsx$/i.test(f));
  return libro ? path.join(raiz, libro) : null;
}

async function recorrido(nav: Navegador, ids: Ids) {
  const { periodoId, pfgId, docenteId, docenteCargaId, grupoId, aulaId } = ids;
  const matriz = (tipo: string, id: string) => `/periodos/${periodoId}/horarios?tipo=${tipo}&id=${id}`;

  // Acceso
  await nav.ir('/logout');
  await nav.capturarPagina('01-acceso-login');

  // Administrador
  await nav.iniciarSesion(CUENTAS.administrador);
  await nav.ir('/');
  await nav.capturarPagina('02-tablero-administrador');
  await nav.capturarElemento('03-menu-administrador', '.app-header', 0);
  await nav.abrirModal('modal-ayuda');
  await nav.capturarPagina('04-ayuda-en-linea');
  await nav.cerrarModales();
  await nav.evaluar('toggleTheme()');
  await pausa(400);
  await nav.capturarPagina('05-tema-claro');
  await nav.evaluar('toggleTheme()');
  await nav.ir('/usuarios');
  await nav.capturarPagina('06-usuarios-listado');
  await nav.abrirModal('modal-nuevo-usuario');
  await nav.capturarElemento('07-usuarios-nuevo', '#modal-nuevo-usuario .uk-modal-dialog');
  await nav.cerrarModales();
  await nav.evaluar(`[...document.querySelectorAll('[onclick^="abrirModalEditar("]')]
    .find((b) => b.getAttribute('onclick').includes(${JSON.stringify(CUENTAS.coordinador)})).click()`);
  await nav.esperar(`document.querySelector('#modal-editar-usuario').classList.contains('uk-open')`);
  await nav.evaluar(`(() => {
    const buscar = document.querySelector('#modal-editar-usuario .programa-picker-search input');
    buscar.value = 'INF';
    buscar.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await pausa(600);
  await nav.capturarElemento('08-usuarios-programas-coordinador', '#modal-editar-usuario .uk-modal-dialog');
  await nav.cerrarModales();
  await nav.ir('/roles');
  await nav.capturarPagina('09-roles-permisos');

  // Director académico: catálogos, período y oferta
  await nav.iniciarSesion(CUENTAS.director);
  await nav.ir('/espacios?q=AUL-DEMO');
  if (!(await nav.evaluar<boolean>(`document.body.innerText.includes('AUL-DEMO-01')`))) {
    throw new Error('El servidor no usa la base de demostración (no muestra AUL-DEMO-01). Se cancela antes de escribir.');
  }
  await nav.ir('/');
  await nav.capturarElemento('10-menu-director', '.app-header', 0);
  await nav.ir(`/curriculo?pfg=${pfgId}`);
  await nav.capturarPagina('11-curriculo-mallas', 1400);
  await nav.abrirModal('modal-nueva-unidad');
  await nav.capturarElemento('12-curriculo-nueva-unidad', '#modal-nueva-unidad .uk-modal-dialog');
  await nav.cerrarModales();
  await nav.ir('/espacios');
  await nav.capturarPagina('13-espacios-aulas', 1300);
  await nav.ir('/espacios?tab=sedes');
  await nav.capturarPagina('14-espacios-sedes', 1300);
  await nav.ir('/docentes');
  await nav.capturarPagina('15-docentes-listado', 1300);
  await nav.abrirModal('modal-nuevo-docente');
  await nav.capturarElemento('16-docentes-nuevo', '#modal-nuevo-docente .uk-modal-dialog');
  await nav.cerrarModales();
  await nav.ir('/docentes/carga-consolidada');
  await nav.capturarPagina('17-docentes-carga-consolidada', 1300);

  // Director: carga una franja más por el docente (solo amplía su disponibilidad) con motivo auditado
  await nav.ir(`/docentes/${docenteId}/disponibilidad`);
  const tras = await nav.evaluar<string>(`(async () => {
    toggleCell(document.querySelector('.disp-cell.is-nodisp'));
    document.getElementById('disp-motivo').value =
      'El docente está de reposo médico y pidió por teléfono habilitar esta franja.';
    const form = document.getElementById('form-disponibilidad');
    form.submit = () => undefined;
    guardarMatriz();
    const r = await fetch(form.action, { method: 'POST', body: new URLSearchParams(new FormData(form)) });
    const url = new URL(r.url);
    return url.pathname + url.search;
  })()`);
  if (!tras.includes('msg=')) throw new Error(`La disponibilidad no se guardó: ${tras}`);
  await nav.ir(tras);
  await nav.capturarPagina('46-disponibilidad-historial', 2200);

  await nav.ir('/periodos');
  await nav.capturarPagina('18-periodos-listado');
  await nav.abrirModal('modal-nuevo-periodo');
  await nav.capturarElemento('19-periodos-nuevo', '#modal-nuevo-periodo .uk-modal-dialog');
  await nav.cerrarModales();
  await nav.ir(`/periodos/${periodoId}/oferta`);
  await nav.capturarPagina('20-oferta-panel', 1400);

  const libro = libroOferta();
  if (libro && existsSync(libro)) {
    const base64 = readFileSync(libro).toString('base64');
    const respuesta = await nav.evaluar<string>(`(async () => {
      const bytes = Uint8Array.from(atob(${JSON.stringify(base64)}), (c) => c.charCodeAt(0));
      const datos = new FormData();
      datos.append('archivo', new Blob([bytes]), 'CONSOLIDADO_OFERTA_CARGA_HORARIA_2026-II.xlsx');
      const r = await fetch('/periodos/${periodoId}/oferta/importar', { method: 'POST', body: datos });
      return r.url;
    })()`);
    if (!respuesta.includes('vista-previa')) throw new Error(`La importación no llegó a la vista previa: ${respuesta}`);
    await nav.ir(`/periodos/${periodoId}/oferta/vista-previa`);
    await nav.capturarPagina('21-oferta-vista-previa', 1500);
    await nav.evaluar(`fetch('/periodos/${periodoId}/oferta/cancelar', { method: 'POST' }).then((r) => r.status)`);
  } else {
    console.warn('[CAPTURAS] Sin libro de oferta (.xlsx): se omite 21-oferta-vista-previa.');
  }

  await nav.ir(`/periodos/${periodoId}/oferta/inconsistencias`);
  await nav.capturarPagina('22-oferta-inconsistencias', 1400);
  await nav.ir(`/periodos/${periodoId}/secciones?pfgId=${pfgId}`);
  await nav.capturarPagina('23-secciones-listado', 1400);
  await nav.evaluar(`document.querySelector('[data-asignar-docente]').click()`);
  await nav.esperar(`document.querySelector('#modal-asignar-docente').classList.contains('uk-open')`);
  await pausa(600);
  await nav.capturarElemento('24-secciones-asignar-docente', '#modal-asignar-docente .uk-modal-dialog');
  await nav.cerrarModales();

  // Director: el solver sobre todo el período queda infactible (otros programas sin disponibilidad)
  await nav.ir(matriz('GRUPO', grupoId));
  await nav.capturarPagina('25-horarios-matriz-vacia', 1300);
  await nav.evaluar('abrirModalSolver()');
  await nav.esperar(`document.getElementById('solver-metric-secciones').textContent !== '--'`);
  await pausa(600);
  await nav.capturarElemento('26-solver-diagnostico', '#modal-solver .uk-modal-dialog');
  await nav.evaluar(`(() => {
    document.getElementById('solver-param-motor').value = 'GENETICO';
    document.getElementById('solver-param-estrategia').value = 'rapido';
    ejecutarSolver();
  })()`);
  await nav.esperar(`!document.getElementById('solver-step-results').classList.contains('uk-hidden')`, 300000);
  await pausa(600);
  await nav.capturarElemento('27-solver-infactible', '#modal-solver .uk-modal-dialog');
  await nav.cerrarModales();

  // Coordinador de PFG
  await nav.iniciarSesion(CUENTAS.coordinador);
  await nav.ir('/');
  await nav.capturarPagina('28-tablero-coordinador');
  await nav.capturarElemento('29-menu-coordinador', '.app-header', 0);
  await nav.ir(`/curriculo?pfg=${pfgId}`);
  await nav.capturarPagina('30-coordinador-curriculo');
  await nav.ir(`/periodos/${periodoId}/oferta`);
  await nav.capturarPagina('31-coordinador-oferta', 1400);
  await nav.ir(matriz('GRUPO', grupoId));
  await nav.evaluar('abrirModalSolver()');
  await nav.esperar(`document.getElementById('solver-metric-secciones').textContent !== '--'`);
  await nav.evaluar(`(() => {
    document.getElementById('solver-param-motor').value = 'CP_SAT';
    ejecutarSolver();
  })()`);
  await nav.esperar(`!document.getElementById('solver-step-results').classList.contains('uk-hidden')`, 300000);
  await pausa(600);
  const estado = await nav.evaluar<string>(`document.getElementById('solver-badge-status').textContent`);
  if (!estado.startsWith('FACTIBLE')) throw new Error(`El solver del coordinador no fue factible: ${estado}`);
  await nav.capturarElemento('32-solver-optimo', '#modal-solver .uk-modal-dialog');
  await nav.evaluar('aplicarHorariosSolver()');
  await nav.esperar(`!document.getElementById('solver-step-success').classList.contains('uk-hidden')`, 120000);
  await pausa(600);
  await nav.capturarElemento('33-solver-aplicado', '#modal-solver .uk-modal-dialog');

  await nav.ir(matriz('GRUPO', grupoId));
  await nav.capturarPagina('34-horarios-grupo', 1300);
  await nav.evaluar(`(() => {
    const filtro = document.getElementById('select-pfg');
    const entidad = document.getElementById('select-entidad');
    let comun = filtro.parentElement;
    while (comun && !comun.contains(entidad)) comun = comun.parentElement;
    comun.id = 'captura-selectores';
  })()`);
  await nav.capturarElemento('35-horarios-selectores', '#captura-selectores', 8);

  // Arrastrar y soltar: un destino válido abre la confirmación; uno ocupado por la cohorte, el conflicto
  const destinos = await nav.evaluar<{ valido: number | null; conflicto: number | null }>(`(async () => {
    const bloque = document.querySelector('.horario-card-badge[data-horario-id]');
    const celdas = [...document.querySelectorAll('.horario-slot-cell')];
    const probar = async (celda) => (await fetch('/periodos/${periodoId}/horarios/validar-drop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seccionId: bloque.dataset.seccionId, horarioId: bloque.dataset.horarioId,
        dia: celda.dataset.dia, horaInicio: celda.dataset.inicio, horaFin: celda.dataset.fin }),
    })).json();
    let valido = null, conflicto = null;
    for (const [i, celda] of celdas.entries()) {
      if (valido !== null && conflicto !== null) break;
      const ocupada = celda.classList.contains('has-class');
      if (ocupada && conflicto === null && !celda.contains(bloque)) {
        if (!(await probar(celda)).esValido) conflicto = i;
      } else if (!ocupada && valido === null) {
        if ((await probar(celda)).esValido) valido = i;
      }
    }
    return { valido, conflicto };
  })()`);
  const soltar = (indice: number) =>
    nav.evaluar(`(() => {
      const bloque = document.querySelector('.horario-card-badge[data-horario-id]');
      dragData = { seccionId: bloque.dataset.seccionId, horarioId: bloque.dataset.horarioId, sourceType: 'MATRIZ' };
      const celda = document.querySelectorAll('.horario-slot-cell')[${indice}];
      return handleDropHorario({ preventDefault() {}, currentTarget: celda });
    })()`);
  if (destinos.valido !== null) {
    await soltar(destinos.valido);
    await nav.esperar(`document.querySelector('#modal-confirmar-asignacion').classList.contains('uk-open')`);
    await pausa(600);
    await nav.capturarElemento('36-horarios-arrastrar-confirmar', '#modal-confirmar-asignacion .uk-modal-dialog');
    await nav.cerrarModales();
  } else {
    console.warn('[CAPTURAS] No se halló un destino válido para 36-horarios-arrastrar-confirmar.');
  }
  if (destinos.conflicto !== null) {
    await soltar(destinos.conflicto);
    await nav.esperar(`document.querySelector('#modal-conflicto-dura').classList.contains('uk-open')`);
    await pausa(600);
    await nav.capturarElemento('37-horarios-conflicto', '#modal-conflicto-dura .uk-modal-dialog');
    await nav.cerrarModales();
  } else {
    console.warn('[CAPTURAS] No se halló un destino en conflicto para 37-horarios-conflicto.');
  }

  await nav.ir(matriz('AULA', aulaId));
  await nav.capturarPagina('38-horarios-aula', 1300);
  await nav.ir(matriz('DOCENTE', docenteCargaId));
  await nav.capturarPagina('39-horarios-docente', 1300);
  const pdf = await nav.pdfMatriz();
  const temporal = mkdtempSync(path.join(tmpdir(), 'sahad-pdf-'));
  try {
    const archivoPdf = path.join(temporal, 'horario.pdf');
    writeFileSync(archivoPdf, Buffer.from(pdf, 'base64'));
    execFileSync('pdftoppm', ['-png', '-r', '110', '-f', '1', '-l', '1', '-singlefile', archivoPdf, path.join(SALIDA, '40-horarios-pdf')]);
    console.log('[CAPTURAS] 40-horarios-pdf.png');
  } finally {
    rmSync(temporal, { recursive: true, force: true });
  }

  await nav.ir('/reportes');
  await nav.capturarPagina('45-normativa', 3200);

  // Docente
  await nav.iniciarSesion(CUENTAS.docente);
  await nav.ir('/');
  await nav.capturarPagina('41-tablero-docente');
  await nav.capturarElemento('42-menu-docente', '.app-header', 0);
  await nav.ir('/mi-disponibilidad');
  await nav.capturarPagina('43-docente-disponibilidad', 2200);
  await nav.ir('/horarios');
  if (!(await nav.evaluar<string>('location.search')).includes(`id=${docenteId}`)) {
    throw new Error('La matriz del docente no abrió su propio horario.');
  }
  if (await nav.evaluar<boolean>(`Boolean(document.getElementById('select-entidad'))`)) {
    throw new Error('La matriz del docente todavía muestra el selector de otros docentes.');
  }
  await nav.capturarPagina('44-docente-horario', 1300);
}

async function main() {
  const ids = await cargarIds();
  mkdirSync(SALIDA, { recursive: true });
  const perfil = mkdtempSync(path.join(tmpdir(), 'sahad-chrome-'));
  const { proceso, puerto } = await lanzarChrome(perfil);
  let nav: Navegador | null = null;
  try {
    nav = await Navegador.abrir(puerto);
    await recorrido(nav, ids);
  } finally {
    nav?.cerrar();
    proceso.kill();
    await pausa(500);
    rmSync(perfil, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error('[CAPTURAS] Error:', e instanceof Error ? e.message : e);
  process.exit(1);
});
