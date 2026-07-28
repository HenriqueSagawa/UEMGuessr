import { Router } from 'express';
import authRoutes from '../modules/auth/auth.routes';
import locationsRoutes from "../modules/locations/locations.routes"

const routes = Router();

routes.get('/health', (req, res) => {
  return res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

routes.use('/auth', authRoutes);

routes.use('/locations', locationsRoutes)

export default routes;