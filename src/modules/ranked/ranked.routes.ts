import { Router } from 'express';
import { authenticate, requireRole } from '../../middlewares/authenticate';
import { validate } from '../../middlewares/validate';
import { createSeasonSchema, submitAnswerSchema } from './ranked.schemas';
import * as rankedController from './ranked.controller';

const router = Router();

router.use(authenticate);

router.get('/me', rankedController.me);
router.get('/leaderboard', rankedController.leaderboard);
router.get('/season/current', rankedController.currentSeason);

router.post('/queue/join', rankedController.joinQueue);
router.get('/queue/status', rankedController.queueStatus);
router.post('/queue/leave', rankedController.leaveQueue);

router.get('/matches/:id', rankedController.getMatch);
router.post(
  '/matches/:id/rounds/:roundNumber/answer',
  validate(submitAnswerSchema),
  rankedController.answer,
);

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
