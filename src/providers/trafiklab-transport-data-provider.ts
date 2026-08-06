import type {
  HistoricalJourneyOutcome,
  HistoricalJourneyQuery,
  JourneySearchInput,
  RealtimeJourneyStatus,
  ScheduledJourney,
  TransportDataProvider,
} from "@/domain/transport";
import { AppError } from "@/lib/errors";

interface CacheEntry {
  expiresAt: number;
  payload: ArrayBuffer;
}

export interface TrafiklabProviderConfig {
  apiKey: string;
  kodaApiKey?: string;
  operator: string;
  gtfsStaticUrl: string;
  gtfsRealtimeUrl?: string;
  kodaUrl: string;
  fetcher?: typeof fetch;
}

/**
 * Trafiklab exposes GTFS and GTFS-RT as files/feeds rather than a journey-planner API.
 * A production deployment must import GTFS into the local schema and decode the
 * protobuf trip updates. This adapter owns authenticated downloads and failure
 * semantics; mock mode remains the complete zero-credential implementation.
 */
export class TrafiklabTransportDataProvider implements TransportDataProvider {
  readonly mode = "trafiklab" as const;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly fetcher: typeof fetch;

  constructor(private readonly config: TrafiklabProviderConfig) {
    this.fetcher = config.fetcher ?? fetch;
  }

  private async authenticatedDownload(
    url: string,
    key: string,
    cacheSeconds: number,
  ): Promise<ArrayBuffer> {
    const cacheKey = `${url}:${key.slice(-4)}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.payload;

    let response: Response;
    try {
      const requestUrl = new URL(url);
      requestUrl.searchParams.set("key", key);
      response = await this.fetcher(requestUrl, {
        headers: { Accept: "application/octet-stream", "User-Agent": "framme-i-tid/0.1" },
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      throw new AppError(
        "PROVIDER_UNAVAILABLE",
        "Trafiklab kunde inte nås. Försök igen senare.",
        { cause: error },
      );
    }

    if (response.status === 429) {
      throw new AppError("RATE_LIMITED", "Trafiklabs anropsgräns har nåtts. Försök senare.");
    }
    if (response.status === 202) {
      throw new AppError(
        "PROVIDER_UNAVAILABLE",
        "KoDa-arkivet håller på att skapas. Trafiklab rekommenderar att anropet görs igen efter cirka 30 sekunder.",
      );
    }
    if (!response.ok) {
      throw new AppError(
        "PROVIDER_UNAVAILABLE",
        `Trafiklab svarade med status ${response.status}.`,
      );
    }

    const payload = await response.arrayBuffer();
    this.cache.set(cacheKey, { expiresAt: Date.now() + cacheSeconds * 1_000, payload });
    return payload;
  }

  async downloadStaticGtfs(): Promise<ArrayBuffer> {
    return this.authenticatedDownload(this.config.gtfsStaticUrl, this.config.apiKey, 86_400);
  }

  async downloadHistoricalTripUpdates(date: string, hour?: number): Promise<ArrayBuffer> {
    if (!this.config.kodaApiKey) {
      throw new AppError(
        "PROVIDER_UNAVAILABLE",
        "TRAFIKLAB_KODA_API_KEY saknas för historiska observationer.",
      );
    }
    const endpoint = new URL(
      `${this.config.kodaUrl.replace(/\/$/, "")}/gtfs-rt/${encodeURIComponent(this.config.operator)}/TripUpdates`,
    );
    endpoint.searchParams.set("date", date);
    if (hour !== undefined) endpoint.searchParams.set("hour", String(hour).padStart(2, "0"));
    return this.authenticatedDownload(endpoint.toString(), this.config.kodaApiKey, 86_400);
  }

  async findJourneys(_input: JourneySearchInput): Promise<ScheduledJourney[]> {
    void _input;
    await this.downloadStaticGtfs();
    throw new AppError(
      "PROVIDER_UNAVAILABLE",
      "GTFS-filen kunde hämtas, men måste importeras till den lokala tidtabellsdatabasen innan Trafiklab-läge kan söka resor.",
    );
  }

  async getComparableJourneyOutcomes(
    input: HistoricalJourneyQuery,
  ): Promise<HistoricalJourneyOutcome[]> {
    if (!this.config.kodaApiKey) {
      throw new AppError(
        "PROVIDER_UNAVAILABLE",
        "TRAFIKLAB_KODA_API_KEY saknas för historiska observationer.",
      );
    }
    await this.downloadHistoricalTripUpdates(input.serviceDate.toISOString().slice(0, 10));
    throw new AppError(
      "PROVIDER_UNAVAILABLE",
      "KoDa-arkivet hämtades, men 7z-filerna måste packas upp och protobuf-poster matchas mot GTFS trip_id innan historik kan beräknas.",
    );
  }

  async getCurrentJourneyStatus(journeyIds: string[]): Promise<RealtimeJourneyStatus[]> {
    if (!this.config.gtfsRealtimeUrl) return [];
    await this.authenticatedDownload(this.config.gtfsRealtimeUrl, this.config.apiKey, 30);
    throw new AppError(
      "PROVIDER_UNAVAILABLE",
      `GTFS-RT hämtades för ${journeyIds.length} resor men protobuf-avkodning kräver operatörsspecifik trip_id-matchning.`,
    );
  }
}
