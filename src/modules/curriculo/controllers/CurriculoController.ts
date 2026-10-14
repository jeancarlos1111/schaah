import { Request, Response } from 'express';
import prisma from '../../../core/database/prisma';
import { TipoEspacio } from '../../../core/domain/enums';
import {
  validarDistribucionHoras,
  validarEspacioRequerido,
  calcularBloquesLectivos,
  validarCorrespondenciaTrayectoTramo,
} from '../../../core/domain/rules/curriculoRules';

export class CurriculoController {
  /**
   * Vista Principal del Módulo de Mallas Curriculares con SahadDataTable Server-Side (Spec 07 / Spec 09)
   */
  static async index(req: Request, res: Response) {
    try {
      const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 10));
      const skip = (page - 1) * limit;

      const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
      const pfgIdQuery = typeof req.query.pfg === 'string' ? req.query.pfg.trim() : '';
      const trayectoQuery = req.query.trayecto ? parseInt(req.query.trayecto as string, 10) : undefined;
      const tramoQuery = req.query.tramo ? parseInt(req.query.tramo as string, 10) : undefined;
      const tipoEspacioQuery = typeof req.query.tipoEspacio === 'string' ? req.query.tipoEspacio.trim() : '';

      const sortBy = typeof req.query.sortBy === 'string' ? req.query.sortBy.trim() : 'trayecto';
      const sortDir = req.query.sortDir === 'desc' ? 'desc' : 'asc';

      const validSortColumns = ['codigo', 'nombre', 'trayecto', 'tramo', 'creditos', 'activa'];
      const activeSortBy = validSortColumns.includes(sortBy) ? sortBy : 'trayecto';

      // Cargar todos los Programas de Formación con conteo de UCs
      const pfgs = await prisma.programaFormacion.findMany({
        orderBy: [{ activo: 'desc' }, { nombre: 'asc' }],
        include: {
          _count: {
            select: { unidadesCurriculares: true },
          },
        },
      });

      // Seleccionar PFG activo (el solicitado o el primero)
      let pfgSeleccionado = pfgs.find((p) => p.id === pfgIdQuery);
      if (!pfgSeleccionado && pfgs.length > 0) {
        pfgSeleccionado = pfgs[0];
      }

      let unidades: any[] = [];
      let totalFiltrados = 0;
      let metricas = {
        totalUnidades: 0,
        totalCreditos: 0,
        totalHorasLectivas: 0,
        totalProyectos: 0,
      };

      if (pfgSeleccionado) {
        // Filtros para unidades
        const whereUnidades: any = {
          pfgId: pfgSeleccionado.id,
        };

        if (q) {
          whereUnidades.OR = [
            { codigo: { contains: q } },
            { nombre: { contains: q } },
          ];
        }

        if (trayectoQuery && !isNaN(trayectoQuery)) {
          whereUnidades.trayecto = trayectoQuery;
        }

        if (tramoQuery && !isNaN(tramoQuery)) {
          whereUnidades.tramo = tramoQuery;
        }

        if (tipoEspacioQuery) {
          whereUnidades.tipoEspacioRequerido = tipoEspacioQuery;
        }

        // Construir ordenamiento relacional
        const orderBy: any = [];
        if (activeSortBy === 'trayecto') {
          orderBy.push({ trayecto: sortDir });
          orderBy.push({ tramo: 'asc' });
          orderBy.push({ codigo: 'asc' });
        } else {
          orderBy.push({ [activeSortBy]: sortDir });
        }

        const [conteo, resultadoUnidades, todasDelPfg] = await Promise.all([
          prisma.unidadCurricular.count({ where: whereUnidades }),
          prisma.unidadCurricular.findMany({
            where: whereUnidades,
            orderBy,
            skip,
            take: limit,
            include: {
              _count: {
                select: { secciones: true },
              },
            },
          }),
          prisma.unidadCurricular.findMany({
            where: { pfgId: pfgSeleccionado.id, activa: true },
          }),
        ]);

        totalFiltrados = conteo;
        unidades = resultadoUnidades;

        // Métricas Bento desacopladas del filtro actual (DoD 3 de Spec 07)
        metricas = todasDelPfg.reduce(
          (acc, uc) => {
            acc.totalUnidades += 1;
            acc.totalCreditos += uc.creditos;
            acc.totalHorasLectivas += (uc.horasTeoricasSemanales + uc.horasPracticasSemanales);
            if (uc.esProyectoComunitario) acc.totalProyectos += 1;
            return acc;
          },
          {
            totalUnidades: 0,
            totalCreditos: 0,
            totalHorasLectivas: 0,
            totalProyectos: 0,
          }
        );
      }

      const totalPages = Math.ceil(totalFiltrados / limit) || 1;
      const pagination = {
        page,
        limit,
        total: totalFiltrados,
        totalPages,
        start: totalFiltrados === 0 ? 0 : skip + 1,
        end: Math.min(skip + limit, totalFiltrados),
        hasNext: page < totalPages,
        hasPrev: page > 1,
      };

      return res.render('pages/curriculo/index', {
        title: 'Mallas y Unidades Curriculares',
        pfgs,
        pfgSeleccionado,
        unidades,
        pagination,
        stats: {
          totalUnidades: metricas.totalUnidades,
          totalCreditos: metricas.totalCreditos,
          totalHorasLectivas: metricas.totalHorasLectivas,
          totalProyectos: metricas.totalProyectos,
        },
        metricas,
        tiposEspacio: Object.values(TipoEspacio),
        filters: {
          q,
          pfg: pfgSeleccionado?.id || '',
          trayecto: trayectoQuery ? String(trayectoQuery) : '',
          tramo: tramoQuery ? String(tramoQuery) : '',
          tipoEspacio: tipoEspacioQuery,
          sortBy: activeSortBy,
          sortDir,
        },
        mensaje: req.query.msg || null,
        error: req.query.error || null,
      });
    } catch (err: any) {
      console.error('[CURRICULO-INDEX-ERROR]', err);
      return res.status(500).render('pages/error', {
        title: 'Error de Currículo',
        statusCode: 500,
        mensaje: 'Error al cargar las mallas curriculares: ' + (err.message || ''),
      });
    }
  }

  /**
   * Crear nuevo PFG
   */
  static async crearPfg(req: Request, res: Response) {
    try {
      const { codigo, nombre, areaConocimiento } = req.body;

      if (!codigo || !nombre || !areaConocimiento) {
        return res.redirect(
          `/curriculo?error=` +
            encodeURIComponent('Código, nombre y área de conocimiento son requeridos.')
        );
      }

      const codigoLimpio = codigo.trim().toUpperCase();

      const existente = await prisma.programaFormacion.findUnique({
        where: { codigo: codigoLimpio },
      });

      if (existente) {
        return res.redirect(
          `/curriculo?error=` +
            encodeURIComponent(`El PFG con código "${codigoLimpio}" ya se encuentra registrado.`)
        );
      }

      const nuevo = await prisma.programaFormacion.create({
        data: {
          codigo: codigoLimpio,
          nombre: nombre.trim(),
          areaConocimiento: areaConocimiento.trim(),
          activo: true,
        },
      });

      return res.redirect(
        `/curriculo?pfg=${nuevo.id}&msg=` +
          encodeURIComponent(`Programa de Formación ${nuevo.codigo} creado exitosamente.`)
      );
    } catch (err: any) {
      console.error('[CREAR-PFG-ERROR]', err);
      return res.redirect(
        `/curriculo?error=` + encodeURIComponent(err.message || 'Error al crear PFG.')
      );
    }
  }

  /**
   * Editar PFG existente
   */
  static async editarPfg(req: Request, res: Response) {
    const { id } = req.params;
    try {
      const { codigo, nombre, areaConocimiento } = req.body;

      if (!codigo || !nombre || !areaConocimiento) {
        return res.redirect(
          `/curriculo?pfg=${id}&error=` +
            encodeURIComponent('Todos los campos son requeridos para editar el PFG.')
        );
      }

      const codigoLimpio = codigo.trim().toUpperCase();

      const choque = await prisma.programaFormacion.findFirst({
        where: {
          codigo: codigoLimpio,
          NOT: { id },
        },
      });

      if (choque) {
        return res.redirect(
          `/curriculo?pfg=${id}&error=` +
            encodeURIComponent(`El código "${codigoLimpio}" ya está en uso por otro PFG.`)
        );
      }

      await prisma.programaFormacion.update({
        where: { id },
        data: {
          codigo: codigoLimpio,
          nombre: nombre.trim(),
          areaConocimiento: areaConocimiento.trim(),
        },
      });

      return res.redirect(
        `/curriculo?pfg=${id}&msg=` + encodeURIComponent('PFG actualizado exitosamente.')
      );
    } catch (err: any) {
      console.error('[EDITAR-PFG-ERROR]', err);
      return res.redirect(
        `/curriculo?pfg=${id}&error=` + encodeURIComponent(err.message || 'Error al editar PFG.')
      );
    }
  }

  /**
   * Activar / Inhabilitar PFG
   */
  static async togglePfg(req: Request, res: Response) {
    const { id } = req.params;
    try {
      const actual = await prisma.programaFormacion.findUnique({
        where: { id },
      });

      if (!actual) {
        return res.redirect(
          `/curriculo?error=` + encodeURIComponent('El PFG indicado no existe.')
        );
      }

      const nuevoEstado = !actual.activo;
      await prisma.programaFormacion.update({
        where: { id },
        data: { activo: nuevoEstado },
      });

      return res.redirect(
        `/curriculo?pfg=${id}&msg=` +
          encodeURIComponent(
            `PFG ${actual.codigo} ${nuevoEstado ? 'activado' : 'inhabilitado'} exitosamente.`
          )
      );
    } catch (err: any) {
      console.error('[TOGGLE-PFG-ERROR]', err);
      return res.redirect(
        `/curriculo?pfg=${id}&error=` +
          encodeURIComponent(err.message || 'Error al cambiar estado del PFG.')
      );
    }
  }

  /**
   * Crear Unidad Curricular (con validaciones RC-01, RC-03, RC-04, RC-05)
   */
  static async crearUnidad(req: Request, res: Response) {
    try {
      const {
        pfgId,
        codigo,
        nombre,
        trayecto,
        tramo,
        creditos,
        horasTeoricasSemanales,
        horasPracticasSemanales,
        horasCampoComunitarioSemanales,
        tipoEspacioRequerido,
        esProyectoComunitario,
      } = req.body;

      if (!pfgId || !codigo || !nombre) {
        return res.redirect(
          `/curriculo?pfg=${pfgId || ''}&error=` +
            encodeURIComponent('PFG, código y nombre son campos obligatorios.')
        );
      }

      const ht = parseInt(horasTeoricasSemanales, 10) || 0;
      const hp = parseInt(horasPracticasSemanales, 10) || 0;
      const hc = parseInt(horasCampoComunitarioSemanales, 10) || 0;
      const esProyecto = esProyectoComunitario === 'true' || esProyectoComunitario === true || esProyectoComunitario === 'on';

      // Validación de distribución horaria
      const distVal = validarDistribucionHoras(ht, hp, hc);
      if (!distVal.valido) {
        return res.redirect(
          `/curriculo?pfg=${pfgId}&error=` + encodeURIComponent(distVal.error!)
        );
      }

      // Validación de espacio requerido
      const espVal = validarEspacioRequerido(tipoEspacioRequerido, esProyecto);
      if (!espVal.valido) {
        return res.redirect(
          `/curriculo?pfg=${pfgId}&error=` + encodeURIComponent(espVal.error!)
        );
      }

      // RC-06: Validación de correspondencia estricta Trayecto-Tramo
      const numTrayecto = parseInt(trayecto, 10);
      const numTramo = parseInt(tramo, 10);
      const ttVal = validarCorrespondenciaTrayectoTramo(numTrayecto, numTramo);
      if (!ttVal.valido) {
        return res.redirect(
          `/curriculo?pfg=${pfgId}&error=` + encodeURIComponent(ttVal.error!)
        );
      }

      const codigoLimpio = codigo.trim().toUpperCase();

      // RC-01: Unicidad curricular dentro del PFG
      const existente = await prisma.unidadCurricular.findFirst({
        where: {
          pfgId,
          codigo: codigoLimpio,
        },
      });

      if (existente) {
        return res.redirect(
          `/curriculo?pfg=${pfgId}&error=` +
            encodeURIComponent(
              `Violación RC-01: El código "${codigoLimpio}" ya existe dentro de este PFG.`
            )
        );
      }

      await prisma.unidadCurricular.create({
        data: {
          pfgId,
          codigo: codigoLimpio,
          nombre: nombre.trim(),
          trayecto: parseInt(trayecto, 10) || 1,
          tramo: parseInt(tramo, 10) || 1,
          creditos: parseInt(creditos, 10) || 3,
          horasTeoricasSemanales: ht,
          horasPracticasSemanales: hp,
          horasCampoComunitarioSemanales: hc,
          tipoEspacioRequerido: espVal.tipoEspacioAjustado,
          esProyectoComunitario: esProyecto,
          activa: true,
        },
      });

      return res.redirect(
        `/curriculo?pfg=${pfgId}&msg=` +
          encodeURIComponent(`Unidad Curricular ${codigoLimpio} registrada con éxito.`)
      );
    } catch (err: any) {
      console.error('[CREAR-UNIDAD-ERROR]', err);
      return res.redirect(
        `/curriculo?pfg=${req.body.pfgId || ''}&error=` +
          encodeURIComponent(err.message || 'Error al registrar unidad curricular.')
      );
    }
  }

  /**
   * Editar Unidad Curricular
   */
  static async editarUnidad(req: Request, res: Response) {
    const { id } = req.params;
    try {
      const {
        pfgId,
        codigo,
        nombre,
        trayecto,
        tramo,
        creditos,
        horasTeoricasSemanales,
        horasPracticasSemanales,
        horasCampoComunitarioSemanales,
        tipoEspacioRequerido,
        esProyectoComunitario,
      } = req.body;

      const ht = parseInt(horasTeoricasSemanales, 10) || 0;
      const hp = parseInt(horasPracticasSemanales, 10) || 0;
      const hc = parseInt(horasCampoComunitarioSemanales, 10) || 0;
      const esProyecto = esProyectoComunitario === 'true' || esProyectoComunitario === true || esProyectoComunitario === 'on';

      const distVal = validarDistribucionHoras(ht, hp, hc);
      if (!distVal.valido) {
        return res.redirect(
          `/curriculo?pfg=${pfgId}&error=` + encodeURIComponent(distVal.error!)
        );
      }

      const espVal = validarEspacioRequerido(tipoEspacioRequerido, esProyecto);
      if (!espVal.valido) {
        return res.redirect(
          `/curriculo?pfg=${pfgId}&error=` + encodeURIComponent(espVal.error!)
        );
      }

      // RC-06: Validación de correspondencia estricta Trayecto-Tramo
      const numTrayecto = parseInt(trayecto, 10);
      const numTramo = parseInt(tramo, 10);
      const ttVal = validarCorrespondenciaTrayectoTramo(numTrayecto, numTramo);
      if (!ttVal.valido) {
        return res.redirect(
          `/curriculo?pfg=${pfgId}&error=` + encodeURIComponent(ttVal.error!)
        );
      }

      const codigoLimpio = codigo.trim().toUpperCase();

      // RC-01: Unicidad dentro del PFG
      const choque = await prisma.unidadCurricular.findFirst({
        where: {
          pfgId,
          codigo: codigoLimpio,
          NOT: { id },
        },
      });

      if (choque) {
        return res.redirect(
          `/curriculo?pfg=${pfgId}&error=` +
            encodeURIComponent(`El código "${codigoLimpio}" ya está registrado en este PFG.`)
        );
      }

      await prisma.unidadCurricular.update({
        where: { id },
        data: {
          codigo: codigoLimpio,
          nombre: nombre.trim(),
          trayecto: parseInt(trayecto, 10) || 1,
          tramo: parseInt(tramo, 10) || 1,
          creditos: parseInt(creditos, 10) || 3,
          horasTeoricasSemanales: ht,
          horasPracticasSemanales: hp,
          horasCampoComunitarioSemanales: hc,
          tipoEspacioRequerido: espVal.tipoEspacioAjustado,
          esProyectoComunitario: esProyecto,
        },
      });

      return res.redirect(
        `/curriculo?pfg=${pfgId}&msg=` +
          encodeURIComponent(`Unidad Curricular ${codigoLimpio} actualizada exitosamente.`)
      );
    } catch (err: any) {
      console.error('[EDITAR-UNIDAD-ERROR]', err);
      return res.redirect(
        `/curriculo?pfg=${req.body.pfgId || ''}&error=` +
          encodeURIComponent(err.message || 'Error al editar unidad curricular.')
      );
    }
  }

  /**
   * Activar / Desactivar Unidad Curricular
   */
  static async toggleUnidad(req: Request, res: Response) {
    const { id } = req.params;
    try {
      const actual = await prisma.unidadCurricular.findUnique({
        where: { id },
      });

      if (!actual) {
        return res.redirect(
          `/curriculo?error=` + encodeURIComponent('Unidad Curricular no encontrada.')
        );
      }

      const nuevoEstado = !actual.activa;
      await prisma.unidadCurricular.update({
        where: { id },
        data: { activa: nuevoEstado },
      });

      return res.redirect(
        `/curriculo?pfg=${actual.pfgId}&msg=` +
          encodeURIComponent(
            `Unidad ${actual.codigo} ${nuevoEstado ? 'activada' : 'inhabilitada'} para oferta.`
          )
      );
    } catch (err: any) {
      console.error('[TOGGLE-UNIDAD-ERROR]', err);
      return res.redirect(
        `/curriculo?error=` + encodeURIComponent(err.message || 'Error al cambiar estado.')
      );
    }
  }

  /**
   * API: Catálogo de unidades curriculares activas de un PFG para carga reactiva
   * GET /curriculo/api/pfg/:id/unidades
   */
  static async apiUnidades(req: Request, res: Response) {
    const { id: pfgId } = req.params;
    try {
      const unidades = await prisma.unidadCurricular.findMany({
        where: {
          pfgId,
          activa: true,
        },
        orderBy: [
          { trayecto: 'asc' },
          { tramo: 'asc' },
          { codigo: 'asc' },
        ],
      });

      const formato = unidades.map((u) => {
        const calculos = calcularBloquesLectivos(
          u.horasTeoricasSemanales,
          u.horasPracticasSemanales,
          u.horasCampoComunitarioSemanales,
          u.esProyectoComunitario
        );

        return {
          id: u.id,
          codigo: u.codigo,
          nombre: u.nombre,
          trayecto: u.trayecto,
          tramo: u.tramo,
          creditos: u.creditos,
          horasTeoricas: u.horasTeoricasSemanales,
          horasPracticas: u.horasPracticasSemanales,
          horasCampo: u.horasCampoComunitarioSemanales,
          horasLectivas: calculos.horasLectivasSemanales,
          bloques90Min: calculos.bloques90Min,
          horasRemanentes: calculos.horasRemanentes,
          tipoEspacioRequerido: u.tipoEspacioRequerido,
          esProyectoComunitario: u.esProyectoComunitario,
          requiereEspacioFisico: calculos.requiereEspacioFisico,
        };
      });

      return res.json({
        ok: true,
        pfgId,
        total: formato.length,
        unidades: formato,
      });
    } catch (err: any) {
      console.error('[API-UNIDADES-ERROR]', err);
      return res.status(500).json({
        ok: false,
        error: 'Error al consultar catálogo de unidades curriculares.',
      });
    }
  }
}
