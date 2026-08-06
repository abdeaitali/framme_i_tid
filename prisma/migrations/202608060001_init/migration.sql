CREATE TABLE "Station" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "municipality" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    CONSTRAINT "Station_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SavedCommute" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "anonymousSessionId" TEXT,
    "originStationId" TEXT NOT NULL,
    "destinationStationId" TEXT NOT NULL,
    "requiredArrivalTime" TIME(0) NOT NULL,
    "weekdays" INTEGER[],
    "targetReliability" DOUBLE PRECISION NOT NULL DEFAULT 0.9,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "SavedCommute_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScheduledJourney" (
    "id" TEXT NOT NULL,
    "externalJourneyId" TEXT NOT NULL,
    "serviceDate" DATE NOT NULL,
    "originStationId" TEXT NOT NULL,
    "destinationStationId" TEXT NOT NULL,
    "scheduledDeparture" TIMESTAMPTZ(3) NOT NULL,
    "scheduledArrival" TIMESTAMPTZ(3) NOT NULL,
    "transferCount" INTEGER NOT NULL DEFAULT 0,
    "routeDescription" TEXT NOT NULL,
    CONSTRAINT "ScheduledJourney_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HistoricalJourneyOutcome" (
    "id" TEXT NOT NULL,
    "externalJourneyId" TEXT NOT NULL,
    "serviceDate" DATE NOT NULL,
    "scheduledDeparture" TIMESTAMPTZ(3) NOT NULL,
    "scheduledArrival" TIMESTAMPTZ(3) NOT NULL,
    "actualDeparture" TIMESTAMPTZ(3),
    "actualArrival" TIMESTAMPTZ(3),
    "cancelled" BOOLEAN NOT NULL DEFAULT false,
    "transferMissed" BOOLEAN,
    "source" TEXT NOT NULL,
    "importedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HistoricalJourneyOutcome_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReliabilityCalculation" (
    "id" TEXT NOT NULL,
    "savedCommuteId" TEXT,
    "calculatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recommendedJourneyId" TEXT NOT NULL,
    "probability" DOUBLE PRECISION NOT NULL,
    "confidence" TEXT NOT NULL,
    "sampleSize" INTEGER NOT NULL,
    "explanation" TEXT NOT NULL,
    "reasonCodes" TEXT[],
    "algorithmVersion" TEXT NOT NULL DEFAULT 'empirical-v1',
    CONSTRAINT "ReliabilityCalculation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Station_externalId_key" ON "Station"("externalId");
CREATE INDEX "Station_name_idx" ON "Station"("name");
CREATE INDEX "SavedCommute_anonymousSessionId_idx" ON "SavedCommute"("anonymousSessionId");
CREATE INDEX "SavedCommute_userId_idx" ON "SavedCommute"("userId");
CREATE UNIQUE INDEX "ScheduledJourney_externalJourneyId_serviceDate_key" ON "ScheduledJourney"("externalJourneyId", "serviceDate");
CREATE INDEX "ScheduledJourney_originStationId_destinationStationId_serviceDate_idx" ON "ScheduledJourney"("originStationId", "destinationStationId", "serviceDate");
CREATE UNIQUE INDEX "HistoricalJourneyOutcome_externalJourneyId_serviceDate_key" ON "HistoricalJourneyOutcome"("externalJourneyId", "serviceDate");
CREATE INDEX "HistoricalJourneyOutcome_externalJourneyId_serviceDate_idx" ON "HistoricalJourneyOutcome"("externalJourneyId", "serviceDate");
CREATE INDEX "ReliabilityCalculation_savedCommuteId_calculatedAt_idx" ON "ReliabilityCalculation"("savedCommuteId", "calculatedAt");

ALTER TABLE "SavedCommute" ADD CONSTRAINT "SavedCommute_originStationId_fkey" FOREIGN KEY ("originStationId") REFERENCES "Station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SavedCommute" ADD CONSTRAINT "SavedCommute_destinationStationId_fkey" FOREIGN KEY ("destinationStationId") REFERENCES "Station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScheduledJourney" ADD CONSTRAINT "ScheduledJourney_originStationId_fkey" FOREIGN KEY ("originStationId") REFERENCES "Station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScheduledJourney" ADD CONSTRAINT "ScheduledJourney_destinationStationId_fkey" FOREIGN KEY ("destinationStationId") REFERENCES "Station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReliabilityCalculation" ADD CONSTRAINT "ReliabilityCalculation_savedCommuteId_fkey" FOREIGN KEY ("savedCommuteId") REFERENCES "SavedCommute"("id") ON DELETE SET NULL ON UPDATE CASCADE;
