import { describe, expect, it } from 'vitest';
import ejs from 'ejs';
import path from 'path';
import { RAIZ_PROYECTO } from '../helpers/baseTemporal';

const VISTA_ERROR = path.join(RAIZ_PROYECTO, 'src/views/pages/error.ejs');

describe('Vista pages/error', () => {
  it('renderiza statusCode y mensaje cuando se pasan correctamente', async () => {
    const html = await ejs.renderFile(VISTA_ERROR, {
      title: 'Acceso Denegado',
      statusCode: 403,
      mensaje: 'No tiene privilegios suficientes.',
    });
    expect(html).toContain('Código 403');
    expect(html).toContain('Acceso Denegado');
    expect(html).toContain('No tiene privilegios suficientes.');
  });

  it('no falla si faltan statusCode o mensaje y acepta el alias legado error', async () => {
    const html = await ejs.renderFile(VISTA_ERROR, {
      title: 'Error de Servidor',
      error: 'No se pudo cargar la nómina de docentes.',
    });
    expect(html).toContain('Código 500');
    expect(html).toContain('Error de Servidor');
    expect(html).toContain('No se pudo cargar la nómina de docentes.');
  });
});
