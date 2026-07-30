import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate";
import { validate } from "../../middlewares/validate";
import { uploadAvatarImage } from "../../middlewares/upload";
import { updateProfileSchema } from "./users.schemas";
import * as usersController from "./users.controller";

const router = Router();

router.get("/profile", authenticate, usersController.getProfile);
router.patch("/profile", authenticate, validate(updateProfileSchema), usersController.updateProfile);
router.put("/profile/avatar", authenticate, uploadAvatarImage, usersController.updateAvatar);
router.delete("/profile/avatar", authenticate, usersController.removeAvatar);

export default router;