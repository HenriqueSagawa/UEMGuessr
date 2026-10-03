ALTER TABLE "Game" ADD COLUMN "pendingLocationId" TEXT;

CREATE INDEX "Game_pendingLocationId_idx" ON "Game"("pendingLocationId");

ALTER TABLE "Game" ADD CONSTRAINT "Game_pendingLocationId_fkey"
  FOREIGN KEY ("pendingLocationId") REFERENCES "Location"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "RankedMatch_seasonId_status_idx" ON "RankedMatch"("seasonId", "status");
CREATE INDEX "RankedRound_resolvedAt_deadline_idx" ON "RankedRound"("resolvedAt", "deadline");
CREATE INDEX "RankedQueueEntry_seasonId_status_expiresAt_idx"
  ON "RankedQueueEntry"("seasonId", "status", "expiresAt");
