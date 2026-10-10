import { Router } from 'express';
import { authController } from './controllers/AuthController';

const router = Router();

router.get('/login', (req, res) => authController.showLogin(req, res));
router.post('/login', (req, res) => authController.login(req, res));
router.get('/logout', (req, res) => authController.logout(req, res));
router.post('/logout', (req, res) => authController.logout(req, res));

export default router;
