import { readFileSync } from 'fs';
import { basename } from 'path';
import prisma, { enableSqliteWal } from '../core/database/prisma';
import { esBaseSqlite, etiquetaRespaldoOferta, respaldarBaseDatos } from '../core/database/respaldo';
import { OfertaImportService } from '../modules/oferta/services/OfertaImportService';

/**
 * Uso: tsx src/scripts/importarOferta.ts <archivo.xlsx> <codigoPeriodo> [--aplicar]
 * Sin --aplicar solo analiza el archivo y muestra el resumen (no escribe en la base de datos).
 */
async function main() {
  const [archivo, codigoPeriodo] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const aplicar = process.argv.includes('--aplicar');
  if (!archivo || !codigoPeriodo) {
    console.error('Uso: tsx src/scripts/importarOferta.ts <archivo.xlsx> <codigoPeriodo> [--aplicar]');
    process.exit(1);
  }

  await enableSqliteWal();
  const periodo = await prisma.periodoAcademico.findUnique({ where: { codigo: codigoPeriodo } });
  if (!periodo) throw new Error(`No existe el período ${codigoPeriodo}. Ejecute "pnpm seed:oferta" o créelo en /periodos.`);

  const servicio = new OfertaImportService();
  const inicio = Date.now();
  const { libro, plan } = await servicio.analizarArchivo(readFileSync(archivo), periodo.id);

  const resumen = {
    hoja: libro.hoja,
    titulo: libro.meta.titulo,
    ...plan.resumen,
    gruposTotales: plan.grupos.length,
    docentesTotales: plan.docentes.length,
    unidadesTotales: plan.unidades.length,
    unidadesCodigoGenerado: plan.unidades.filter((u) => u.codigoGenerado).length,
    programas: plan.programas.map((p) => `${p.codigo}${p.nuevo ? ' (nuevo)' : ''}`).join(', '),
    sedesNuevas: plan.sedesNuevas.join(', ') || 'ninguna',
    centros: plan.centros.join(', '),
    avisos: plan.avisos.length,
    sobrecargasH04: plan.sobrecargas.length,
    dedicacionesInconsistentes: plan.dedicacionesInconsistentes.length,
    horariosEnObservaciones: plan.horariosObservados.length,
    analisisMs: Date.now() - inicio,
  };
  console.log('[OFERTA] Resumen del análisis:');
  console.table(resumen);
  if (plan.errores.length > 0) {
    console.log('[OFERTA] Filas descartadas:');
    plan.errores.forEach((e) => console.log(`  Fila ${e.fila}: ${e.mensaje}`));
  }
  if (plan.sobrecargas.length > 0) {
    console.log('[OFERTA] Sobrecargas H-04 (top 10):');
    plan.sobrecargas.slice(0, 10).forEach((s) => console.log(`  ${s.cedula} ${s.nombre}: ${s.horas}h / tope ${s.maxHoras}h`));
  }

  if (!aplicar) {
    console.log('[OFERTA] Análisis sin cambios. Agregue --aplicar para importar.');
    return;
  }

  if (esBaseSqlite()) {
    const respaldo = await respaldarBaseDatos(prisma, { etiqueta: etiquetaRespaldoOferta(archivo) });
    console.log(`[OFERTA] Respaldo previo: ${respaldo}`);
  }
  const t0 = Date.now();
  const resultado = await servicio.aplicarPlan(plan, periodo.id, {
    nombreArchivo: basename(archivo),
    usuarioNombre: `Consola (${process.env.USER || 'sistema'})`,
  });
  console.log(`[OFERTA] Importación aplicada en ${Date.now() - t0} ms:`);
  console.table(resultado);
}

main()
  .catch((e) => {
    console.error('[OFERTA] Error:', e.message || e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
