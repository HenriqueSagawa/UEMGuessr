import { Router } from 'express';

const routes = Router();

routes.get('/health', (req, res) => {
  return res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default routes;