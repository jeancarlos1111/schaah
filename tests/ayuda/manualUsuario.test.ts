import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'fs';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import path from 'path';
import ejs from 'ejs';
import express from 'express';
import type { Request } from 'express';
import { RolUsuario } from '../../src/core/domain/enums';
import ayudaRoutes, { manualTecnico, manualUsuario } from '../../src/modules/ayuda/ayudaRoutes';
import {
  DIRECTORIO_IMAGENES_MANUAL,
  RUTA_MANUAL_TECNICO,
  RUTA_MANUAL_USUARIO,
  cargarManualTecnico,
  cargarManualUsuario,
  imagenesDelManual,
  renderizarManual,
  slugEncabezado,
} from '../../src/modules/ayuda/manualRenderer';
import { respuesta } from '../helpers/peticiones';

const RAIZ = path.resolve(__dirname, '../..');
const VISTA_MANUAL = path.join(RAIZ, 'src/views/pages/ayuda/manual-usuario.ejs');
const VISTA_TECNICO = path.join(RAIZ, 'src/views/pages/ayuda/manual-tecnico.ejs');
const MODAL_AYUDA = path.join(RAIZ, 'src/views/partials/modal-ayuda.ejs');
const FIRMA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const markdown = readFileSync(RUTA_MANUAL_USUARIO, 'utf8');
const manual = cargarManualUsuario();
const markdownTecnico = readFileSync(RUTA_MANUAL_TECNICO, 'utf8');
const tecnico = cargarManualTecnico();

/** Texto de una sección de nivel 2 (desde su encabezado hasta el siguiente de nivel 2). */
function seccion(numero: number): string {
  const inicio = markdown.indexOf(`\n## ${numero}. `);
  expect(inicio, `falta la sección ${numero}`).toBeGreaterThan(-1);
  const fin = markdown.indexOf('\n## ', inicio + 1);
  return markdown.slice(inicio, fin === -1 ? undefined : fin);
}

describe('Manual de usuario: capturas de pantalla', () => {
  const referencias = imagenesDelManual(markdown);

  it('referencia las capturas con rutas relativas a docs/ y todas existen como PNG válidos', () => {
    expect(referencias.length).toBeGreaterThanOrEqual(40);
    for (const ref of referencias) {
      expect(ref).toMatch(/^img\/manual\/\d{2}-[a-z0-9-]+\.png$/);
      const archivo = path.join(DIRECTORIO_IMAGENES_MANUAL, ref.replace(/^img\//, ''));
      expect(existsSync(archivo), `no existe ${archivo}`).toBe(true);
      expect(readFileSync(archivo).subarray(0, 8).equals(FIRMA_PNG), `${ref} no es PNG`).toBe(true);
    }
  });

  it('no deja capturas huérfanas ni repetidas', () => {
    const enDisco = readdirSync(path.join(DIRECTORIO_IMAGENES_MANUAL, 'manual'))
      .filter((f) => f.endsWith('.png'))
      .map((f) => `img/manual/${f}`)
      .sort();
    expect([...referencias].sort()).toEqual(enDisco);
    expect(new Set(referencias).size).toBe(referencias.length);
  });

  it('cada captura lleva debajo su pie de figura, numerado en orden', () => {
    const lineas = markdown.split('\n');
    const pies = lineas
      .map((linea, i) => ({ linea, anterior: lineas[i - 1] ?? '' }))
      .filter(({ anterior }) => /^\s*!\[[^\]]+\]\(img\/manual\//.test(anterior));
    expect(pies).toHaveLength(referencias.length);
    pies.forEach(({ linea }, i) => expect(linea).toMatch(new RegExp(`^\\s*\\*Figura ${i + 1}\\. .+\\*$`)));
  });
});

describe('Manual de usuario: contenido por rol y por módulo', () => {
  it('tiene las siete secciones del plan', () => {
    const titulos = manual.indice.filter((e) => e.nivel === 2).map((e) => e.texto);
    expect(titulos).toEqual([
      '1. Introducción y conceptos',
      '2. Acceso y elementos comunes',
      '3. Roles y permisos',
      '4. Flujo correcto por rol',
      '5. Módulos del sistema',
      '6. Mensajes del sistema',
      '7. Soporte',
    ]);
  });

  it('describe el flujo de trabajo de cada rol del sistema, con al menos una captura', () => {
    const flujo = seccion(4);
    const subsecciones = flujo.split('\n### ').slice(1);
    for (const rol of Object.values(RolUsuario)) {
      const propia = subsecciones.find((s) => s.split('\n')[0].includes(`\`${rol}\``));
      expect(propia, `sin flujo para ${rol}`).toBeDefined();
      expect(propia!).toMatch(/^1\. \*\*/m);
      expect(imagenesDelManual(propia!).length, `sin captura en el flujo de ${rol}`).toBeGreaterThan(0);
    }
  });

  it('la matriz de permisos tiene una columna por rol', () => {
    const cabecera = seccion(3)
      .split('\n')
      .find((l) => l.startsWith('| Acción'));
    expect(cabecera).toBe('| Acción | Administrador | Planificador | Coordinador de PFG | Docente |');
  });

  it('dedica una sección con captura a cada módulo del menú', () => {
    const modulos = seccion(5).split('\n### ').slice(1);
    const titulos = modulos.map((m) => m.split('\n')[0]);
    for (const nombre of ['Usuarios', 'Mallas', 'Docentes', 'Espacios', 'Períodos', 'Oferta', 'Matriz de horarios']) {
      const modulo = modulos.find((m) => m.split('\n')[0].includes(nombre));
      expect(modulo, `falta el módulo ${nombre} en ${titulos.join(', ')}`).toBeDefined();
      expect(imagenesDelManual(modulo!).length).toBeGreaterThan(0);
    }
  });

  it('explica en la tabla de mensajes cada restricción dura y la de integridad del solver', () => {
    const filas = seccion(6)
      .split('\n')
      .filter((l) => l.startsWith('| **'));
    const codigos = filas.map((l) => l.match(/^\| \*\*([A-Z0-9-]+)\*\*/)?.[1]);
    expect(codigos).toEqual([
      'H-01',
      'H-02',
      'H-03',
      'H-04',
      'H-05',
      'H-06',
      'H-07',
      'H-08',
      'H-09',
      'H-10',
      'H-13',
      'H-14',
      'H-ACCESIBILIDAD-PISO',
      'H-DIAS-DISPONIBILIDAD',
      'INTEGRIDAD',
    ]);
    for (const fila of filas) {
      const [, , significado, accion] = fila.split('|').map((c) => c.trim());
      expect(significado.length).toBeGreaterThan(20);
      expect(accion.length).toBeGreaterThan(20);
    }
  });

  it('muestra los horarios en formato civil de 12 horas', () => {
    expect(markdown).not.toMatch(/\b(1[3-9]|2[0-3]):[0-5]\d\b/);
  });

  it('deja explícito que el Docente solo consulta su propio horario en la matriz', () => {
    const docente = seccion(4).split('\n### ').find((s) => s.startsWith('4.4 Docente'));
    expect(docente).toBeDefined();
    expect(docente!).toMatch(/solo su (propio )?horario/i);
    expect(docente!).toMatch(/Solo puede consultar su propio horario/);
    expect(docente!).toMatch(/no aparecen el optimizador/i);
    expect(docente!).toMatch(/sin solver/i);
  });
});

describe('Centro de ayuda en línea y manual técnico', () => {
  it('el modal de ayuda nombra Planificador y no Director Académico como rol vigente', () => {
    const modal = readFileSync(MODAL_AYUDA, 'utf8');
    expect(modal).toMatch(/Planificador/);
    expect(modal).not.toMatch(/directores/i);
    expect(modal).not.toMatch(/Director Académico/);
    expect(modal).toMatch(/solo lectura|únicamente su propio horario/i);
  });

  it('el manual técnico se carga desde docs/MANUAL_TECNICO.md y menciona Planificador y H-13', () => {
    expect(tecnico.titulo).toMatch(/Manual Técnico/);
    expect(markdownTecnico).toMatch(/PLANIFICADOR/);
    expect(markdownTecnico).toMatch(/H-13/);
    expect(tecnico.html).toMatch(/H-13/);
  });

  it('la ruta /ayuda/manual-tecnico renderiza el markdown actual', () => {
    const { res, capturada } = respuesta();
    manualTecnico({} as Request, res);
    expect(capturada.vista).toBe('pages/ayuda/manual-tecnico');
    expect(capturada.locals.manual).toEqual(tecnico);
  });

  it('la vista del manual técnico muestra el índice del markdown', async () => {
    const html = await ejs.renderFile(VISTA_TECNICO, { title: 'Manual Técnico', manual: tecnico });
    expect(html).toContain(tecnico.titulo);
    for (const entrada of tecnico.indice.filter((e) => e.nivel === 2).slice(0, 3)) {
      expect(html).toContain(`href="#${entrada.id}"`);
    }
  });
});

describe('Renderizado del manual a HTML', () => {
  it('genera anclas sin tildes y únicas aunque se repita un encabezado', () => {
    expect(slugEncabezado('5.7 Matriz de horarios (`/periodos/:id/horarios`)')).toBe('5-7-matriz-de-horarios-periodos-id-horarios');
    expect(slugEncabezado('Períodos y Sección Única')).toBe('periodos-y-seccion-unica');

    const r = renderizarManual('# Título\n\n## Pasos\n\n### Pasos\n\n#### Detalle\n');
    expect(r.titulo).toBe('Título');
    expect(r.html).not.toContain('<h1');
    expect(r.html).toContain('<h2 id="pasos">Pasos</h2>');
    expect(r.html).toContain('<h3 id="pasos-2">Pasos</h3>');
    expect(r.html).toContain('<h4 id="detalle">Detalle</h4>');
    expect(r.indice).toEqual([
      { nivel: 2, texto: 'Pasos', id: 'pasos' },
      { nivel: 3, texto: 'Pasos', id: 'pasos-2' },
    ]);
  });

  it('marca las capturas, escapa sus atributos y envuelve las tablas con el estilo del sistema', () => {
    const r = renderizarManual('![Vista "previa" <oferta>](img/manual/21-x.png "Pie")\n\n| A | B |\n| - | - |\n| `x` | **y** |\n');
    expect(r.html).toContain(
      '<img class="manual-captura" src="img/manual/21-x.png" alt="Vista &quot;previa&quot; &lt;oferta&gt;" title="Pie" loading="lazy">'
    );
    expect(r.html).toContain('<div class="manual-tabla"><table class="clean-table"><thead><tr><th>A</th><th>B</th></tr></thead>');
    expect(r.html).toContain('<td><code>x</code></td><td><strong>y</strong></td>');
  });

  it('el manual real produce un ancla por cada entrada del índice y una imagen por cada captura', () => {
    expect(manual.titulo).toBe('Manual de Usuario — SAHAD UBV');
    for (const entrada of manual.indice) expect(manual.html).toContain(`id="${entrada.id}"`);
    const imagenes = [...manual.html.matchAll(/<img class="manual-captura" src="([^"]+)"/g)].map((m) => m[1]);
    expect(imagenes).toEqual(imagenesDelManual(markdown));
  });
});

describe('Página /ayuda/manual-usuario', () => {
  it('el controlador renderiza la vista del manual con el contenido actual de docs/', () => {
    const { res, capturada } = respuesta();
    manualUsuario({} as Request, res);
    expect(capturada.vista).toBe('pages/ayuda/manual-usuario');
    expect(capturada.locals.title).toBe('Manual de Usuario');
    expect(capturada.locals.manual).toEqual(manual);
  });

  it('la vista muestra el índice navegable y el contenido con sus capturas', async () => {
    const html = await ejs.renderFile(VISTA_MANUAL, { title: 'Manual de Usuario', manual });
    expect(html).toContain('<h1 class="page-title uk-margin-remove">Manual de Usuario — SAHAD UBV</h1>');
    for (const entrada of manual.indice) {
      expect(html).toContain(`<li class="manual-indice-nivel-${entrada.nivel}">`);
      expect(html).toContain(`<a href="#${entrada.id}">`);
    }
    expect(html).toContain('src="img/manual/01-acceso-login.png"');
    expect(html).not.toMatch(/style="/);
  });

  describe('servidor HTTP local con las rutas de ayuda', () => {
    let servidor: Server;
    let base: string;

    beforeAll(async () => {
      const app = express();
      app.set('view engine', 'ejs');
      app.set('views', path.join(RAIZ, 'src/views'));
      app.use(ayudaRoutes);
      servidor = app.listen(0, '127.0.0.1');
      await new Promise((ok) => servidor.once('listening', ok));
      base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
    });

    afterAll(() => new Promise<void>((ok) => servidor.close(() => ok())));

    it('las rutas relativas de las capturas resuelven a /ayuda/img/manual/ y se sirven como PNG', async () => {
      const pagina = await fetch(`${base}/ayuda/manual-usuario`);
      expect(pagina.status).toBe(200);
      const html = await pagina.text();
      const relativa = html.match(/<img class="manual-captura" src="([^"]+)"/)![1];
      const url = new URL(relativa, `${base}/ayuda/manual-usuario`);
      expect(url.pathname).toBe('/ayuda/img/manual/01-acceso-login.png');

      const imagen = await fetch(url);
      expect(imagen.status).toBe(200);
      expect(imagen.headers.get('content-type')).toBe('image/png');
      expect(Buffer.from(await imagen.arrayBuffer()).subarray(0, 8).equals(FIRMA_PNG)).toBe(true);
    });

    it('responde 404 a capturas inexistentes y no expone archivos fuera de docs/img', async () => {
      expect((await fetch(`${base}/ayuda/img/manual/99-no-existe.png`)).status).toBe(404);
      const fuera = await fetch(`${base}/ayuda/img/%2e%2e/MANUAL_USUARIO.md`);
      expect([403, 404]).toContain(fuera.status);
      expect(await fuera.text()).not.toContain('# Manual de Usuario');
    });
  });
});
