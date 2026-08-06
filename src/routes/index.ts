import { Router } from 'express';
import authRoutes from '../modules/auth/auth.routes';
import locationsRoutes from '../modules/locations/locations.routes';
import gamesRoutes from '../modules/games/games.routes';
import usersRoutes from '../modules/users/users.routes';
import dailyChallengeRoutes from '../modules/dailyChallenge/dailyChallenge.routes';

const routes = Router();

routes.get('/health', (req, res) => {
  return res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

routes.use('/auth', authRoutes);

routes.use('/locations', locationsRoutes);

routes.use('/games', gamesRoutes);

routes.use('/users', usersRoutes);

routes.use('/daily-challenges', dailyChallengeRoutes);

export default routes;
