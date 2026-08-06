import { PrismaClient } from "@prisma/client";
import { importMockData } from "../src/services/mock-import-service";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const result = await importMockData(prisma);
  console.info(
    `Seeded ${result.stations} stations, ${result.scheduledJourneys} schedules and ${result.historicalObservations} synthetic observations.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
