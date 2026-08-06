import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { collectTrafikverketWindow } from "../src/services/trafikverket-collector-service";

const HOUR_MS = 3_600_000;

function numericArgument(
  name: string,
  environmentValue: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const prefix = `--${name}=`;
  const raw =
    process.argv.slice(2).find((argument) => argument.startsWith(prefix))?.slice(prefix.length) ??
    environmentValue;
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}.`);
  }
  return value;
}

async function main(): Promise<void> {
  const hoursBack = numericArgument(
    "hours-back",
    process.env.TRAFIKVERKET_COLLECT_HOURS_BACK,
    12,
    0,
    24 * 365,
  );
  const hoursAhead = numericArgument(
    "hours-ahead",
    process.env.TRAFIKVERKET_COLLECT_HOURS_AHEAD,
    8,
    0,
    24 * 14,
  );
  const chunkHours = numericArgument(
    "chunk-hours",
    process.env.TRAFIKVERKET_COLLECT_CHUNK_HOURS,
    24,
    1,
    24,
  );
  const finalizationDelayMinutes = numericArgument(
    "finalization-delay-minutes",
    process.env.TRAFIKVERKET_FINALIZATION_DELAY_MINUTES,
    180,
    0,
    24 * 60,
  );
  const overlapHours = numericArgument(
    "overlap-hours",
    process.env.TRAFIKVERKET_COLLECT_OVERLAP_HOURS,
    6,
    0,
    12,
  );
  const now = new Date();
  const startTime = new Date(now.getTime() - hoursBack * HOUR_MS);
  const endTime = new Date(now.getTime() + hoursAhead * HOUR_MS);
  const totals = {
    announcements: 0,
    observationsUpserted: 0,
    scheduledJourneysUpserted: 0,
    historicalOutcomesUpserted: 0,
  };

  for (
    let chunkStart = startTime;
    chunkStart < endTime;
    chunkStart = new Date(chunkStart.getTime() + chunkHours * HOUR_MS)
  ) {
    const queryStart =
      chunkStart.getTime() === startTime.getTime()
        ? chunkStart
        : new Date(chunkStart.getTime() - overlapHours * HOUR_MS);
    const chunkEnd = new Date(
      Math.min(endTime.getTime(), chunkStart.getTime() + chunkHours * HOUR_MS),
    );
    const result = await collectTrafikverketWindow({
      startTime: queryStart,
      endTime: chunkEnd,
      finalizationDelayMinutes,
    });
    totals.announcements += result.announcements;
    totals.observationsUpserted += result.observationsUpserted;
    totals.scheduledJourneysUpserted += result.scheduledJourneysUpserted;
    totals.historicalOutcomesUpserted += result.historicalOutcomesUpserted;
  }

  console.info(JSON.stringify({ event: "trafikverket.collection.summary", ...totals }));
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
