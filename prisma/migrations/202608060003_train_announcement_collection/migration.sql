CREATE TABLE "TrainAnnouncementObservation" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "trainIdent" TEXT NOT NULL,
    "scheduledDepartureDateTime" TIMESTAMPTZ(3),
    "activityType" TEXT NOT NULL,
    "locationSignature" TEXT NOT NULL,
    "advertisedTimeAtLocation" TIMESTAMPTZ(3) NOT NULL,
    "estimatedTimeAtLocation" TIMESTAMPTZ(3),
    "actualTimeAtLocation" TIMESTAMPTZ(3),
    "cancelled" BOOLEAN NOT NULL DEFAULT false,
    "operatorName" TEXT,
    "productDescription" TEXT,
    "deviations" TEXT[],
    "sourceModifiedAt" TIMESTAMPTZ(3),
    "firstSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "TrainAnnouncementObservation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TrainAnnouncementObservation_sourceId_key"
ON "TrainAnnouncementObservation"("sourceId");

CREATE INDEX "TrainAnnouncementObservation_trainIdent_scheduledDepartureDateTime_idx"
ON "TrainAnnouncementObservation"("trainIdent", "scheduledDepartureDateTime");

CREATE INDEX "TrainAnnouncementObservation_locationSignature_advertisedTimeAtLocation_idx"
ON "TrainAnnouncementObservation"("locationSignature", "advertisedTimeAtLocation");

CREATE INDEX "TrainAnnouncementObservation_advertisedTimeAtLocation_idx"
ON "TrainAnnouncementObservation"("advertisedTimeAtLocation");
