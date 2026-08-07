-- The application and collector connect directly through Prisma. No browser or
-- Supabase Data API role should have access to these server-owned tables.
ALTER TABLE "public"."_prisma_migrations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Station" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."SavedCommute" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ScheduledJourney" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."HistoricalJourneyOutcome" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ReliabilityCalculation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."TrainAnnouncementObservation" ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE "public"."_prisma_migrations" FROM anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON TABLE "public"."Station" FROM anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON TABLE "public"."SavedCommute" FROM anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON TABLE "public"."ScheduledJourney" FROM anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON TABLE "public"."HistoricalJourneyOutcome" FROM anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON TABLE "public"."ReliabilityCalculation" FROM anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON TABLE "public"."TrainAnnouncementObservation" FROM anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM anon, authenticated, service_role;
