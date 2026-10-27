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
import periodoRoutes from './modules/periodos/periodoRoutes';
import horarioRoutes from './modules/horarios/horarioRoutes';
import solverRoutes from './modules/solver/solverRoutes';
import curriculoRoutes from './modules/curriculo/curriculoRoutes';
import ofertaRoutes from './modules/oferta/ofertaRoutes';
import auditoriaRoutes from './modules/auditoria/auditoriaRoutes';
import ayudaRoutes from './modules/ayuda/ayudaRoutes';
import normativaRoutes from './modules/normativa/normativaRoutes';
import { tablero } from './modules/tablero/TableroController';
import { attachUserToLocals, requireAuth } from './modules/auth/middlewares/authMiddleware';
import { cargarAlcancePfg } from './modules/auth/middlewares/alcancePfg';
import { enableSqliteWal } from './core/database/prisma';

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
    secret: process.env.SESSION_SECRET || 'sahad_default_secret_dev',
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
app.use(cargarAlcancePfg);

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
app.use(periodoRoutes);
app.use(horarioRoutes);
app.use(solverRoutes);
app.use(curriculoRoutes);
app.use(ofertaRoutes);
app.use(auditoriaRoutes);

// Documentación y Manuales Oficiales
app.use(ayudaRoutes);
app.use(normativaRoutes);

// Dashboard Principal (Protegido)
app.get('/', requireAuth, tablero);

app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    system: 'SAHAD - UBV Kerepakupai Vena',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.listen(PORT, () => {
  console.log(`[SAHAD-UBV] Servidor corriendo en http://localhost:${PORT}`);
  console.log(`[SAHAD-UBV] Modo: ${process.env.NODE_ENV || 'development'}`);
});

export default app;
