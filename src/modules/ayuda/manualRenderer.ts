import { readFileSync } from 'fs';
import { Marked, Tokens } from 'marked';
import path from 'path';

export const RUTA_MANUAL_USUARIO = path.resolve(__dirname, '../../../docs/MANUAL_USUARIO.md');
export const RUTA_MANUAL_TECNICO = path.resolve(__dirname, '../../../docs/MANUAL_TECNICO.md');
export const DIRECTORIO_IMAGENES_MANUAL = path.resolve(__dirname, '../../../docs/img');

export interface EntradaIndice {
  nivel: number;
  texto: string;
  id: string;
}

export interface ManualRenderizado {
  titulo: string;
  html: string;
  indice: EntradaIndice[];
}

/** Ancla de un encabezado: minúsculas sin tildes, palabras separadas por guiones. */
export function slugEncabezado(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function escaparAtributo(valor: string): string {
  return valor.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function textoPlano(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

/**
 * Markdown del manual a HTML. El primer encabezado de nivel 1 se devuelve como título (la vista
 * lo muestra en su cabecera); los de nivel 2 y 3 llevan `id` y forman el índice.
 * Las imágenes conservan su ruta relativa (`img/manual/...`), que desde `/ayuda/manual-usuario`
 * resuelve a `/ayuda/img/manual/...`.
 */
export function renderizarManual(markdown: string): ManualRenderizado {
  let titulo = '';
  const indice: EntradaIndice[] = [];
  const usados = new Map<string, number>();

  const marked = new Marked({
    gfm: true,
    renderer: {
      heading(this: { parser: { parseInline(tokens: Tokens.Generic[]): string } }, token: Tokens.Heading) {
        const contenido = this.parser.parseInline(token.tokens);
        const texto = textoPlano(contenido);
        if (token.depth === 1 && !titulo) {
          titulo = texto;
          return '';
        }
        const base = slugEncabezado(texto) || 'seccion';
        const repeticion = usados.get(base) ?? 0;
        usados.set(base, repeticion + 1);
        const id = repeticion === 0 ? base : `${base}-${repeticion + 1}`;
        if (token.depth <= 3) indice.push({ nivel: token.depth, texto, id });
        return `<h${token.depth} id="${id}">${contenido}</h${token.depth}>\n`;
      },
      image(token: Tokens.Image) {
        const titulo = token.title ? ` title="${escaparAtributo(token.title)}"` : '';
        return `<img class="manual-captura" src="${escaparAtributo(token.href)}" alt="${escaparAtributo(token.text)}"${titulo} loading="lazy">`;
      },
      table(this: { parser: { parseInline(tokens: Tokens.Generic[]): string } }, token: Tokens.Table) {
        const celda = (c: Tokens.TableCell, etiqueta: 'th' | 'td') =>
          `<${etiqueta}>${this.parser.parseInline(c.tokens)}</${etiqueta}>`;
        const cabecera = `<tr>${token.header.map((c) => celda(c, 'th')).join('')}</tr>`;
        const filas = token.rows.map((fila) => `<tr>${fila.map((c) => celda(c, 'td')).join('')}</tr>`).join('');
        return `<div class="manual-tabla"><table class="clean-table"><thead>${cabecera}</thead><tbody>${filas}</tbody></table></div>\n`;
      },
    },
  });

  const html = marked.parse(markdown, { async: false }) as string;
  return { titulo, html, indice };
}

/** Rutas relativas de todas las imágenes del Markdown, en orden de aparición. */
export function imagenesDelManual(markdown: string): string[] {
  return [...markdown.matchAll(/!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)].map((m) => m[1]);
}

export function cargarManualUsuario(ruta = RUTA_MANUAL_USUARIO): ManualRenderizado {
  return renderizarManual(readFileSync(ruta, 'utf8'));
}

export function cargarManualTecnico(ruta = RUTA_MANUAL_TECNICO): ManualRenderizado {
  return renderizarManual(readFileSync(ruta, 'utf8'));
}
