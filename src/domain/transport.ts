export type DataSourceKind = "mock" | "trafiklab" | "trafikverket" | "hybrid";
export type JourneyDataSource = "mock" | "trafiklab" | "trafikverket";
export type ServiceCategory = "local" | "regional" | "intercity" | "mixed";

export interface Station {
  id: string;
  externalId: string;
  name: string;
  municipality: string;
  latitude: number;
  longitude: number;
}

export interface JourneySearchInput {
  originStationId: string;
  destinationStationId: string;
  serviceDate: Date;
  arrivalDeadline: Date;
}

export interface ScheduledJourney {
  id: string;
  externalJourneyId: string;
  serviceDate: Date;
  originStationId: string;
  destinationStationId: string;
  scheduledDeparture: Date;
  scheduledArrival: Date;
  transferCount: number;
  routeDescription: string;
  operatorName?: string;
  serviceCategory?: ServiceCategory;
  scheduleSource?: JourneyDataSource;
}

export interface HistoricalJourneyQuery {
  externalJourneyId: string;
  serviceDate: Date;
  scheduledDeparture: Date;
  lookbackWeeks?: number;
}

export interface HistoricalJourneyOutcome {
  id: string;
  externalJourneyId: string;
  serviceDate: Date;
  scheduledDeparture: Date;
  scheduledArrival: Date;
  actualDeparture: Date | null;
  actualArrival: Date | null;
  cancelled: boolean;
  transferMissed: boolean | null;
  source: string;
}

export type DisruptionSeverity = "none" | "minor" | "major";

export interface RealtimeJourneyStatus {
  journeyId: string;
  delayMinutes: number;
  cancelled: boolean;
  disruptionSeverity: DisruptionSeverity;
  message?: string;
}

export interface ScheduleProvider {
  findJourneys(input: JourneySearchInput): Promise<ScheduledJourney[]>;
}

export interface HistoricalPerformanceProvider {
  getComparableJourneyOutcomes(
    input: HistoricalJourneyQuery,
  ): Promise<HistoricalJourneyOutcome[]>;
  getComparableJourneyOutcomesBatch?(
    inputs: HistoricalJourneyQuery[],
  ): Promise<Map<string, HistoricalJourneyOutcome[]>>;
}

export interface RealtimeProvider {
  getCurrentJourneyStatus(
    journeyIds: string[],
  ): Promise<RealtimeJourneyStatus[]>;
}

export interface TransportDataProvider
  extends ScheduleProvider,
    HistoricalPerformanceProvider,
    RealtimeProvider {
  readonly mode: DataSourceKind;
}
