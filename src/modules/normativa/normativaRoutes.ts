import { Router } from 'express';
import { requireAuth } from '../auth/middlewares/authMiddleware';
import { normativa } from './NormativaController';

const router = Router();

router.get('/reportes', requireAuth, normativa);

export default router;
