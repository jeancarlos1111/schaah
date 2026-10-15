import path from 'path';
import { loadFeature } from '@amiceli/vitest-cucumber';

export const RUTA_SPEC05 = path.resolve(__dirname, '../../specs/05-acceptance-tests.feature');

/**
 * Spec 05 en español; cada archivo de pasos ejecuta solo la regla de su etiqueta.
 * En Gherkin los escenarios heredan las etiquetas de su `Regla:`, pero vitest-cucumber filtra
 * cada escenario solo por las suyas, así que la herencia se aplica aquí.
 */
export async function cargarSpec05() {
  const feature = await loadFeature(RUTA_SPEC05, { language: 'es' });
  for (const regla of feature.rules) {
    const heredables = [regla.background, ...regla.scenarii].filter((s) => s !== null);
    for (const elemento of heredables) {
      regla.tags.forEach((tag) => elemento.tags.add(tag));
    }
  }
  return feature;
}
