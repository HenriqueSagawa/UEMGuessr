-- CreateTable
CREATE TABLE "DailyChallenge" (
    "id" TEXT NOT NULL,
    "challengeDate" TIMESTAMP(3) NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "timeLimitSeconds" INTEGER NOT NULL DEFAULT 60,
    "locationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyChallengeAttempt" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "guessLatitude" DECIMAL(9,6) NOT NULL,
    "guessLongitude" DECIMAL(9,6) NOT NULL,
    "distanceMeters" DECIMAL(10,2) NOT NULL,
    "score" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),

    CONSTRAINT "DailyChallengeAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyChallenge_challengeDate_key" ON "DailyChallenge"("challengeDate");

-- CreateIndex
CREATE INDEX "DailyChallenge_startsAt_idx" ON "DailyChallenge"("startsAt");

-- CreateIndex
CREATE INDEX "DailyChallenge_endsAt_idx" ON "DailyChallenge"("endsAt");

-- CreateIndex
CREATE INDEX "DailyChallengeAttempt_challengeId_score_idx" ON "DailyChallengeAttempt"("challengeId", "score");

-- CreateIndex
CREATE UNIQUE INDEX "DailyChallengeAttempt_challengeId_userId_key" ON "DailyChallengeAttempt"("challengeId", "userId");

-- AddForeignKey
ALTER TABLE "DailyChallenge" ADD CONSTRAINT "DailyChallenge_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyChallengeAttempt" ADD CONSTRAINT "DailyChallengeAttempt_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "DailyChallenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyChallengeAttempt" ADD CONSTRAINT "DailyChallengeAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
