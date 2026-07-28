import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate";
import { validate } from "../../middlewares/validate";
import { submitGuessSchema } from "./games.schemas";
import * as gamesController from "./games.controller";

const router = Router();

router.use(authenticate);

router.post("/", gamesController.create);
router.get("/", gamesController.list);
router.get("/:id", gamesController.getById);
router.get("/:id/next-round", gamesController.nextRound);
router.post("/:id/rounds", validate(submitGuessSchema), gamesController.submitGuess);
router.post("/:id/finish", gamesController.finish);

export default router;