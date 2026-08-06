-- AlterTable
ALTER TABLE "DailyChallengeAttempt" ALTER COLUMN "guessLatitude" DROP NOT NULL,
ALTER COLUMN "guessLongitude" DROP NOT NULL,
ALTER COLUMN "distanceMeters" DROP NOT NULL,
ALTER COLUMN "score" DROP NOT NULL;
