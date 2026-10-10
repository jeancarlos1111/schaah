import express, { Request, Response } from 'express';
import session from 'express-session';
import path from 'path';
import dotenv from 'dotenv';
import expressLayouts from 'express-ejs-layouts';
import authRoutes from './modules/auth/authRoutes';
import usuarioRoutes from './modules/usuarios/usuarioRoutes';
import roleRoutes from './modules/roles/roleRoutes';
import espacioRoutes from './modules/espacios/espacioRoutes';
import docenteRoutes from './modules/docentes/docenteRoutes';
import { attachUserToLocals, requireAuth } from './modules/auth/middlewares/authMiddleware';
import prisma, { enableSqliteWal } from './core/database/prisma';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Inicialización de SQLite en modo WAL
enableSqliteWal();

// Middleware básico de Express
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Sesiones HTTP
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'schaah_default_secret_dev',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 8, // 8 horas
      sameSite: 'lax',
    },
  })
);

// Inyección de usuario de sesión en todas las plantillas
app.use(attachUserToLocals);

// Configuración de Motor EJS con Layouts Automáticos
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(expressLayouts);
app.set('layout', 'layouts/main');
app.set('layout extractScripts', true);
app.set('layout extractStyles', true);

// Rutas de Autenticación (Públicas)
app.use(authRoutes);

// Rutas de Administración de Usuarios, Espacios y Docentes (Protegidas)
app.use(usuarioRoutes);
app.use(roleRoutes);
app.use(espacioRoutes);
app.use(docenteRoutes);

// Dashboard Principal (Protegido)
app.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const [
      docentesTotales,
      docentesExclusivos,
      seccionesTotales,
      seccionesAsignadas,
      espaciosTotales,
      sedesActivas,
    ] = await Promise.all([
      prisma.profesor.count({ where: { activo: true } }),
      prisma.profesorDedicacion.count({ where: { dedicacion: 'DEDICACION_EXCLUSIVA' } }),
      prisma.seccion.count(),
      prisma.seccion.count({ where: { profesorId: { not: null } } }),
      prisma.espacioFisico.count({ where: { activo: true } }),
      prisma.sede.count({ where: { activa: true } }),
    ]);

    const porcentajeAsignado = seccionesTotales > 0
      ? Math.round((seccionesAsignadas / seccionesTotales) * 1000) / 10
      : 0;

    res.render('pages/dashboard', {
      title: 'Tablero de Control',
      periodoActivo: '2026-I (Semestral)',
      metricas: {
        docentesTotales,
        docentesExclusivos,
        seccionesTotales,
        seccionesAsignadas,
        porcentajeAsignado,
        espaciosTotales,
        sedesActivas,
        alertasSobrecarga: 0,
      },
    });
  } catch (err) {
    console.error('[DASHBOARD-ERROR]', err);
    res.render('pages/dashboard', {
      title: 'Tablero de Control',
      periodoActivo: '2026-I (Semestral)',
      metricas: {
        docentesTotales: 0,
        docentesExclusivos: 0,
        seccionesTotales: 0,
        seccionesAsignadas: 0,
        porcentajeAsignado: 0,
        espaciosTotales: 0,
        sedesActivas: 0,
        alertasSobrecarga: 0,
      },
    });
  }
});

app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    system: 'SCHAAH - UBV',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.listen(PORT, () => {
  console.log(`[SCHAAH-UBV] Servidor corriendo en http://localhost:${PORT}`);
  console.log(`[SCHAAH-UBV] Modo: ${process.env.NODE_ENV || 'development'}`);
});

export default app;
