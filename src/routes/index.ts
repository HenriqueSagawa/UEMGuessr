import { Router } from 'express';
import authRoutes from '../modules/auth/auth.routes';

const routes = Router();

routes.get('/health', (req, res) => {
  return res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

routes.use('/auth', authRoutes);

export default routes;