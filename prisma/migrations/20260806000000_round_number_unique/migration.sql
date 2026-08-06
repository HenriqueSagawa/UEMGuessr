/*
  Warnings:

  - A unique constraint covering the columns `[gameId,roundNumber]` on the table `Round` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Round_gameId_roundNumber_key" ON "Round"("gameId", "roundNumber");
