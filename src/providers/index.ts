import type { TransportDataProvider } from "@/domain/transport";
import { logger } from "@/lib/logger";
import { MockTransportDataProvider } from "./mock-transport-data-provider";
import { TrafiklabTransportDataProvider } from "./trafiklab-transport-data-provider";
import { TrafikverketRailDataProvider } from "./trafikverket-rail-data-provider";
import { HybridTransportDataProvider } from "./hybrid-transport-data-provider";

let provider: TransportDataProvider | undefined;

function nonNegativeInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function enabledByDefault(value: string | undefined): boolean {
  return value?.toLowerCase() !== "false";
}

export function getTransportDataProvider(): TransportDataProvider {
  if (provider) return provider;

  const requestedMode = process.env.TRANSPORT_DATA_MODE?.toLowerCase();
  const apiKey = process.env.TRAFIKLAB_API_KEY;
  const trafikverketApiKey = process.env.TRAFIKVERKET_API_KEY;
  const createTrafiklabProvider = (): TrafiklabTransportDataProvider =>
    new TrafiklabTransportDataProvider({
      apiKey: apiKey!,
      kodaApiKey: process.env.TRAFIKLAB_KODA_API_KEY,
      operator: process.env.TRAFIKLAB_OPERATOR ?? "otraf",
      gtfsStaticUrl:
        process.env.TRAFIKLAB_GTFS_STATIC_URL ??
        "https://opendata.samtrafiken.se/gtfs-sweden/sweden.zip",
      gtfsRealtimeUrl: process.env.TRAFIKLAB_GTFS_RT_URL,
      kodaUrl: process.env.TRAFIKLAB_KODA_URL ?? "https://api.koda.trafiklab.se/KoDa/api/v2",
    });
  const createTrafikverketProvider = (): TrafikverketRailDataProvider =>
    new TrafikverketRailDataProvider({
      apiKey: trafikverketApiKey!,
      endpoint:
        process.env.TRAFIKVERKET_API_URL ??
        "https://api.trafikinfo.trafikverket.se/v2/data.json",
      minRequestIntervalMs: nonNegativeInteger(
        process.env.TRAFIKVERKET_MIN_REQUEST_INTERVAL_MS,
        250,
      ),
      maxRateLimitRetries: nonNegativeInteger(
        process.env.TRAFIKVERKET_RATE_LIMIT_RETRIES,
        1,
      ),
      preferStoredData: enabledByDefault(
        process.env.TRAFIKVERKET_USE_STORED_DATA,
      ),
    });

  if (requestedMode === "hybrid" && apiKey && trafikverketApiKey) {
    provider = new HybridTransportDataProvider(
      createTrafiklabProvider(),
      createTrafikverketProvider(),
    );
    return provider;
  }
  if (requestedMode === "trafikverket" && trafikverketApiKey) {
    provider = createTrafikverketProvider();
    return provider;
  }
  if (requestedMode === "trafiklab" && apiKey) {
    provider = createTrafiklabProvider();
    return provider;
  }

  if (requestedMode && requestedMode !== "mock") {
    logger.warn("provider.mock_fallback", {
      reason: "missing_provider_api_key",
      requestedMode,
      hasTrafiklabKey: Boolean(apiKey),
      hasTrafikverketKey: Boolean(trafikverketApiKey),
    });
  }
  provider = new MockTransportDataProvider();
  return provider;
}

export function resetTransportDataProviderForTests(): void {
  provider = undefined;
}
