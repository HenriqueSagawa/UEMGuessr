-- CreateEnum
CREATE TYPE "SeasonStatus" AS ENUM ('PREVIEW', 'ACTIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "RankedDivision" AS ENUM ('BRONZE_III', 'BRONZE_II', 'BRONZE_I', 'PRATA_III', 'PRATA_II', 'PRATA_I', 'OURO_III', 'OURO_II', 'OURO_I', 'PLATINA_III', 'PLATINA_II', 'PLATINA_I', 'DIAMANTE_III', 'DIAMANTE_II', 'DIAMANTE_I', 'MESTRE');

-- CreateEnum
CREATE TYPE "RankedMatchStatus" AS ENUM ('IN_PROGRESS', 'FINISHED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "RankedQueueStatus" AS ENUM ('WAITING', 'MATCHED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Season" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "SeasonStatus" NOT NULL DEFAULT 'PREVIEW',
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RankedProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL DEFAULT 1200,
    "division" "RankedDivision" NOT NULL DEFAULT 'PRATA_III',
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "bestRating" INTEGER NOT NULL DEFAULT 1200,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RankedProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RankedMatch" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "status" "RankedMatchStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "player1Id" TEXT NOT NULL,
    "player2Id" TEXT NOT NULL,
    "player1Health" INTEGER NOT NULL DEFAULT 5000,
    "player2Health" INTEGER NOT NULL DEFAULT 5000,
    "roundMultiplier" DECIMAL(6,2) NOT NULL DEFAULT 1,
    "currentRoundNumber" INTEGER NOT NULL DEFAULT 0,
    "winnerId" TEXT,
    "player1RatingDelta" INTEGER,
    "player2RatingDelta" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RankedMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RankedRound" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "locationId" TEXT NOT NULL,
    "multiplier" DECIMAL(6,2) NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deadline" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "player1GuessLatitude" DECIMAL(9,6),
    "player1GuessLongitude" DECIMAL(9,6),
    "player1Score" INTEGER,
    "player1DistanceMeters" DECIMAL(10,2),
    "player1AnsweredAt" TIMESTAMP(3),
    "player1Damage" INTEGER,
    "player2GuessLatitude" DECIMAL(9,6),
    "player2GuessLongitude" DECIMAL(9,6),
    "player2Score" INTEGER,
    "player2DistanceMeters" DECIMAL(10,2),
    "player2AnsweredAt" TIMESTAMP(3),
    "player2Damage" INTEGER,

    CONSTRAINT "RankedRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RankedQueueEntry" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "status" "RankedQueueStatus" NOT NULL DEFAULT 'WAITING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "matchedMatchId" TEXT,

    CONSTRAINT "RankedQueueEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Season_name_key" ON "Season"("name");

-- CreateIndex
CREATE INDEX "Season_status_idx" ON "Season"("status");

-- CreateIndex
CREATE INDEX "RankedProfile_seasonId_rating_idx" ON "RankedProfile"("seasonId", "rating");

-- CreateIndex
CREATE UNIQUE INDEX "RankedProfile_userId_seasonId_key" ON "RankedProfile"("userId", "seasonId");

-- CreateIndex
CREATE INDEX "RankedMatch_seasonId_idx" ON "RankedMatch"("seasonId");

-- CreateIndex
CREATE INDEX "RankedMatch_player1Id_idx" ON "RankedMatch"("player1Id");

-- CreateIndex
CREATE INDEX "RankedMatch_player2Id_idx" ON "RankedMatch"("player2Id");

-- CreateIndex
CREATE INDEX "RankedMatch_status_idx" ON "RankedMatch"("status");

-- CreateIndex
CREATE INDEX "RankedRound_matchId_resolvedAt_idx" ON "RankedRound"("matchId", "resolvedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RankedRound_matchId_roundNumber_key" ON "RankedRound"("matchId", "roundNumber");

-- CreateIndex
CREATE INDEX "RankedQueueEntry_seasonId_status_idx" ON "RankedQueueEntry"("seasonId", "status");

-- CreateIndex
CREATE INDEX "RankedQueueEntry_userId_idx" ON "RankedQueueEntry"("userId");

-- CreateIndex
CREATE INDEX "RankedQueueEntry_expiresAt_idx" ON "RankedQueueEntry"("expiresAt");

-- AddForeignKey
ALTER TABLE "RankedProfile" ADD CONSTRAINT "RankedProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RankedProfile" ADD CONSTRAINT "RankedProfile_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RankedMatch" ADD CONSTRAINT "RankedMatch_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RankedMatch" ADD CONSTRAINT "RankedMatch_player1Id_fkey" FOREIGN KEY ("player1Id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RankedMatch" ADD CONSTRAINT "RankedMatch_player2Id_fkey" FOREIGN KEY ("player2Id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RankedMatch" ADD CONSTRAINT "RankedMatch_winnerId_fkey" FOREIGN KEY ("winnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RankedRound" ADD CONSTRAINT "RankedRound_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "RankedMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RankedRound" ADD CONSTRAINT "RankedRound_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RankedQueueEntry" ADD CONSTRAINT "RankedQueueEntry_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RankedQueueEntry" ADD CONSTRAINT "RankedQueueEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RankedQueueEntry" ADD CONSTRAINT "RankedQueueEntry_matchedMatchId_fkey" FOREIGN KEY ("matchedMatchId") REFERENCES "RankedMatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
