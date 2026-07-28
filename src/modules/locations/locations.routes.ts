import { Router } from "express";
import { authenticate, requireRole } from "../../middlewares/authenticate";
import { validate } from "../../middlewares/validate";
import { uploadLocationImage } from "../../middlewares/upload";
import { createLocationSchema, updateLocationSchema } from "./locations.schemas";
import * as locationsController from "./locations.controller";

const router = Router();

router.get("/", authenticate, requireRole("ADMIN"), locationsController.list);
router.get("/:id", authenticate, requireRole("ADMIN"), locationsController.getById);

router.post(
  "/",
  authenticate,
  requireRole("ADMIN"),
  uploadLocationImage,
  validate(createLocationSchema),
  locationsController.create,
);

router.patch(
  "/:id",
  authenticate,
  requireRole("ADMIN"),
  uploadLocationImage,
  validate(updateLocationSchema),
  locationsController.update,
);

router.delete("/:id", authenticate, requireRole("ADMIN"), locationsController.remove);

export default router;