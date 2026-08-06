ALTER TABLE "ScheduledJourney"
ADD COLUMN "operatorName" TEXT,
ADD COLUMN "serviceCategory" TEXT NOT NULL DEFAULT 'local',
ADD COLUMN "scheduleSource" TEXT NOT NULL DEFAULT 'mock';
