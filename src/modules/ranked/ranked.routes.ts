import { Router } from 'express';
import { authenticate, requireRole } from '../../middlewares/authenticate';
import { validate } from '../../middlewares/validate';
import { createSeasonSchema } from './ranked.schemas';
import * as rankedController from './ranked.controller';

const router = Router();

router.use(authenticate);

router.get('/me', rankedController.me);
router.get('/me/stats', rankedController.myStats);
router.get('/me/matches', rankedController.matchHistory);
router.get('/stats', rankedController.seasonStats);
router.get('/leaderboard', rankedController.leaderboard);
router.get('/season/current', rankedController.currentSeason);
router.get('/presence', rankedController.presence);

router.post(
  '/seasons',
  requireRole('ADMIN'),
  validate(createSeasonSchema),
  rankedController.createSeason,
);
router.post(
  '/seasons/current/end',
  requireRole('ADMIN'),
  rankedController.endSeason,
);
router.get('/seasons', requireRole('ADMIN'), rankedController.listSeasons);

export default router;