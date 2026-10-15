/** Vuelve a la página de secciones desde la que se envió el formulario (con sus filtros), nunca a otra ruta. */
export function urlRetornoSecciones(periodoId: string, volver: unknown, clave: 'msg' | 'error', mensaje: string): string {
  const base = `/periodos/${periodoId}/secciones`;
  const destino = typeof volver === 'string' && (volver === base || volver.startsWith(`${base}?`)) ? volver : base;
  const url = new URL(destino, 'http://sahad.local');
  url.searchParams.delete('msg');
  url.searchParams.delete('error');
  url.searchParams.set(clave, mensaje);
  return `${url.pathname}${url.search}`;
}
