import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { validate } from '../../middlewares/validate';
import { submitDailyChallengeGuessSchema } from './dailyChallenge.schemas';
import * as dailyChallengeController from './dailyChallenge.controller';

const router = Router();

router.use(authenticate);

router.get('/current', dailyChallengeController.getCurrent);
router.get('/:id/leaderboard', dailyChallengeController.leaderboard);
router.post('/:id/start', dailyChallengeController.start);
router.post(
  '/:id/submit',
  validate(submitDailyChallengeGuessSchema),
  dailyChallengeController.submitGuess,
);

export default router;
