import type {
  HistoricalJourneyOutcome,
  HistoricalJourneyQuery,
  JourneySearchInput,
  RealtimeJourneyStatus,
  ScheduledJourney,
  TransportDataProvider,
} from "@/domain/transport";

export class HybridTransportDataProvider implements TransportDataProvider {
  readonly mode = "hybrid" as const;

  constructor(
    private readonly localProvider: TransportDataProvider,
    private readonly intercityProvider: TransportDataProvider,
  ) {}

  async findJourneys(input: JourneySearchInput): Promise<ScheduledJourney[]> {
    const results = await Promise.allSettled([
      this.localProvider.findJourneys(input),
      this.intercityProvider.findJourneys(input),
    ]);
    const journeys = results.flatMap((result) =>
      result.status === "fulfilled" ? result.value : [],
    );
    if (journeys.length === 0) {
      const failure = results.find(
        (result): result is PromiseRejectedResult => result.status === "rejected",
      );
      if (failure) throw failure.reason;
    }
    return journeys.sort(
      (left, right) => left.scheduledDeparture.getTime() - right.scheduledDeparture.getTime(),
    );
  }

  getComparableJourneyOutcomes(
    input: HistoricalJourneyQuery,
  ): Promise<HistoricalJourneyOutcome[]> {
    return input.externalJourneyId.startsWith("trafikverket:")
      ? this.intercityProvider.getComparableJourneyOutcomes(input)
      : this.localProvider.getComparableJourneyOutcomes(input);
  }

  async getComparableJourneyOutcomesBatch(
    inputs: HistoricalJourneyQuery[],
  ): Promise<Map<string, HistoricalJourneyOutcome[]>> {
    const localInputs = inputs.filter(
      (input) => !input.externalJourneyId.startsWith("trafikverket:"),
    );
    const intercityInputs = inputs.filter((input) =>
      input.externalJourneyId.startsWith("trafikverket:"),
    );
    const load = async (
      provider: TransportDataProvider,
      queries: HistoricalJourneyQuery[],
    ): Promise<Map<string, HistoricalJourneyOutcome[]>> => {
      if (queries.length === 0) return new Map();
      if (provider.getComparableJourneyOutcomesBatch) {
        return provider.getComparableJourneyOutcomesBatch(queries);
      }
      return new Map(
        await Promise.all(
          queries.map(async (query) => [
            query.externalJourneyId,
            await provider.getComparableJourneyOutcomes(query),
          ] as const),
        ),
      );
    };
    const [local, intercity] = await Promise.all([
      load(this.localProvider, localInputs),
      load(this.intercityProvider, intercityInputs),
    ]);
    return new Map([...local, ...intercity]);
  }

  async getCurrentJourneyStatus(
    journeyIds: string[],
  ): Promise<RealtimeJourneyStatus[]> {
    const localIds = journeyIds.filter((id) => !id.startsWith("trafikverket:"));
    const intercityIds = journeyIds.filter((id) => id.startsWith("trafikverket:"));
    const [local, intercity] = await Promise.all([
      localIds.length ? this.localProvider.getCurrentJourneyStatus(localIds) : [],
      intercityIds.length
        ? this.intercityProvider.getCurrentJourneyStatus(intercityIds)
        : [],
    ]);
    return [...local, ...intercity];
  }
}
