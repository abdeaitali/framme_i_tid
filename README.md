# Framme i tid

Framme i tid is a working MVP for reliability-first public-transport planning in a limited Swedish pilot area. Instead of answering “what does the timetable say?”, it answers:

> Tell us when you must arrive. We tell you when to leave.

The Swedish UI evaluates multiple departures against historical arrival outcomes, recommends the latest option that reaches the requested reliability target, explains the evidence, and lets an anonymous user save one recurring commute with a seven-day summary.

The original Linköping–Norrköping–Mjölby–Stockholm pilot has been expanded with major railway hubs on the Stockholm–Gothenburg, Stockholm–Malmö, Mälaren, and East Coast corridors. The station list remains configuration-driven.

## What is included

- Responsive Next.js App Router UI in Swedish.
- PostgreSQL schema and migration through Prisma.
- Deterministic schedule and historical seed data.
- Provider interfaces for schedules, history, and realtime status.
- Complete mock provider, a credential-aware Trafiklab adapter for local/regional feeds, and a Trafikverket rail adapter plus PostgreSQL collector for intercity trains.
- Empirical reliability calculation with cancellation, transfer, sample-size, and realtime penalties.
- Machine-readable reason codes and plain-Swedish explanations.
- Anonymous httpOnly-cookie session for one saved commute.
- Seven-day saved-commute summary.
- Zod validation and consistent API errors.
- Vitest unit/integration tests and one Playwright end-to-end flow.
- Basic privacy and methodology pages.

## Architecture

The MVP is a single Next.js application with a PostgreSQL database. A small idempotent command collects Trafikverket observations; it can be invoked by cron or the included GitHub Actions workflow without introducing a queue or separate service.

```text
Browser
  ├─ App Router pages and client forms
  └─ /api routes
       ├─ Zod validation
       ├─ recommendation/commute services
       ├─ provider interfaces
       │    ├─ MockTransportDataProvider
       │    ├─ TrafiklabTransportDataProvider (local/regional)
       │    ├─ TrafikverketRailDataProvider (intercity rail)
       │    └─ HybridTransportDataProvider (merged candidates)
       ├─ pure reliability engine
       └─ Prisma → PostgreSQL

Scheduled GitHub Action / cron
  └─ Trafikverket TrainAnnouncement collector
       ├─ raw station observations
       ├─ direct schedules for configured station pairs
       └─ finalized historical outcomes → PostgreSQL
```

Server components render search results and the weekly summary. Client components are limited to interactive forms and save actions. The reliability engine under `src/lib/reliability` is pure and independent of Next.js and Prisma.

All instants are stored as timezone-aware PostgreSQL timestamps in UTC. Service dates use PostgreSQL `date`, the recurring required-arrival time uses `time`, and UI conversion uses `Europe/Stockholm`.

## Local setup

Prerequisites:

- Node.js 20.9 or newer (Node 24 is also supported)
- npm
- Docker with Docker Compose

Create the environment file and start the application:

```bash
cp .env.example .env
docker compose up -d
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The default environment uses mock mode and needs no transport API credentials.

The database container exposes PostgreSQL on port `5432` and persists data in the `framme_postgres_data` Docker volume. Check its health with:

```bash
docker compose ps
```

On macOS, Docker Desktop must be running before `docker compose up -d`. If Docker Desktop is installed but its CLI is not on your shell `PATH`, either enable its CLI tools in Docker Desktop settings or run:

```bash
open -a Docker
/Applications/Docker.app/Contents/Resources/bin/docker compose up -d
```

Wait until `docker compose ps` reports the PostgreSQL service as `healthy`. A Prisma `P1001` error means PostgreSQL is not reachable; it is unrelated to Trafiklab or Trafikverket credentials. Do not run `db:seed` until `db:migrate` succeeds.

### Database commands

```bash
npm run db:migrate       # apply committed migrations
npm run db:migrate:dev   # create a migration while developing
npm run db:seed          # idempotently import deterministic mock data
npm run db:studio        # inspect data with Prisma Studio
```

The development-only endpoint `POST /api/import/mock` runs the same idempotent mock import. It is disabled when `NODE_ENV=production`.

For Supabase deployments, the committed hardening migration enables Row Level Security on every application table (including Prisma's migration table) and revokes access from the Data API roles. No client policies are created because this MVP accesses PostgreSQL only through server-side Prisma; the `postgres` connection used by the application, migrations, and collector remains available.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection string used only on the server. |
| `TRANSPORT_DATA_MODE` | Yes | `mock`, `trafiklab`, `trafikverket`, or `hybrid`; missing required keys fall back to mock. |
| `TRAFIKLAB_API_KEY` | Trafiklab mode | Server-only GTFS Sweden 3 / GTFS-RT key. |
| `TRAFIKLAB_KODA_API_KEY` | Historical import | Server-only KoDa key. |
| `TRAFIKLAB_OPERATOR` | Trafiklab mode | Regional operator abbreviation, initially `otraf`. |
| `TRAFIKLAB_GTFS_STATIC_URL` | No | Static GTFS Sweden 3 ZIP endpoint. |
| `TRAFIKLAB_GTFS_RT_URL` | Realtime | Operator-specific TripUpdates protobuf URL. |
| `TRAFIKLAB_KODA_URL` | No | KoDa v2 base URL. |
| `TRAFIKVERKET_API_KEY` | Trafikverket mode | Server-only key from Trafikverket's Data Exchange Portal. |
| `TRAFIKVERKET_API_URL` | No | Defaults to the official v2 JSON endpoint. |
| `TRAFIKVERKET_MIN_REQUEST_INTERVAL_MS` | No | Minimum delay between Trafikverket calls; defaults to `250`. Increase it if the account has a stricter limit. |
| `TRAFIKVERKET_RATE_LIMIT_RETRIES` | No | Number of HTTP 429 retries honoring `Retry-After`; defaults to `1`. |
| `TRAFIKVERKET_USE_STORED_DATA` | No | Defaults to `true`; recommendations read collected schedules/history before making live calls. |
| `TRAFIKVERKET_COLLECT_HOURS_BACK` | No | Rolling collector lookback, default `12` hours. |
| `TRAFIKVERKET_COLLECT_HOURS_AHEAD` | No | Rolling schedule horizon, default `8` hours. |
| `TRAFIKVERKET_COLLECT_CHUNK_HOURS` | No | Maximum API window per call, default `24` hours. |
| `TRAFIKVERKET_COLLECT_OVERLAP_HOURS` | No | Overlap between backfill chunks so overnight trains are paired, default `6`. |
| `TRAFIKVERKET_FINALIZATION_DELAY_MINUTES` | No | Grace period before a journey without an actual arrival becomes a missing observation, default `180`. |
| `NEXT_PUBLIC_APP_URL` | No | Public application URL; contains no secret. |

If a real-data mode is requested without its required key, the provider factory logs a structured warning and automatically selects mock mode. Credentials are never referenced by a client component.

## Data-source strategy

The source is selected by transport market and journey, not just by geography:

| Journey class | Examples | Primary source | Why |
| --- | --- | --- | --- |
| Local public transport | SL metro/commuter services, Östgötatrafiken buses and local trains | Trafiklab GTFS plus operator-specific GTFS-RT; KoDa for history | These feeds describe local schedules, stop patterns, and available operator realtime data. |
| Regional rail | Mälartåg and similar regional services | Trafiklab where coverage is complete, with Trafikverket as railway-status enrichment | Regional services can sit between the two source families. |
| Intercity rail | SJ, Snälltåget, VR and other railway companies | Trafikverket `TrainAnnouncement` | Trafikverket exposes operator-independent station announcements, train identity, planned/estimated/actual time, cancellations, operator, product, and deviations. |
| Mixed/transfer journey | Östgötatrafiken → SJ | Hybrid composition | Each leg retains its own source and operator; transfer risk is evaluated across the composed journey. |

Mock journeys now carry `operatorName`, `serviceCategory`, and `scheduleSource`. The same fields are optional on provider-returned domain journeys and stored on `ScheduledJourney`, so the UI can state which source and operator support a result.

## Mock data

`npm run db:seed` creates:

- eighteen configured stations (the original four plus fourteen major railway hubs);
- fourteen deterministic journey patterns and fourteen upcoming service dates per pattern;
- 84 historical observations per pattern (1,176 observations in total).

The three required example corridors each have multiple departure patterns:

- Linköping C → Norrköping C
- Linköping C → Stockholm Central
- Norrköping C → Stockholm Central

Mjölby → Linköping C and Mjölby → Stockholm Central are also included. The synthetic profiles contain on-time arrivals, small and major delays, cancellations, missing observations, direct journeys, transfer journeys, missed transfers, Monday/Friday effects, and peak-time effects. Generation is formula-based rather than random, so tests and demonstrations remain stable.

Every page that displays calculated mock results labels them as synthetic demonstration data.

## Reliability algorithm

For each scheduled candidate, the service requests up to 12 weeks of comparable observations for the same journey pattern. Same-weekday records are sorted first. The pure calculation then:

1. Excludes non-cancelled records with no actual arrival or implausible delays; reports the excluded count.
2. Projects each valid historical arrival delay onto the candidate’s scheduled arrival.
3. Counts the projection as successful when it is at or before the user’s deadline.
4. Counts every cancellation as a failure.
5. Calculates sample size, empirical success probability, median/80th/90th-percentile arrival delay, cancellation rate, and observed missed-transfer rate.
6. Applies a five-percentage-point penalty below 15 observations or a two-point penalty at 15–39 observations.
7. Applies a capped penalty based on observed missed transfers for transfer journeys.
8. Applies a capped realtime delay/disruption penalty when status data exists.
9. Selects the latest departure at or above the target (90% by default). If none qualifies, it selects the highest-probability option and adds `NO_OPTION_MEETS_TARGET`.

Ties are resolved by later departure, fewer transfers, and larger usable sample. Probabilities are displayed as rounded whole percentages. Confidence is high at 40+ usable observations, medium at 15–39, and low below 15.

Reason codes returned by the API include:

- `HIGH_HISTORICAL_RELIABILITY`
- `LOW_CANCELLATION_RATE`
- `SAFER_THAN_LATER_OPTION`
- `TRANSFER_RISK`
- `LOW_SAMPLE_SIZE`
- `CURRENT_DISRUPTION`
- `NO_OPTION_MEETS_TARGET`
- `LARGE_RECOMMENDED_BUFFER`

## API routes

| Method and path | Purpose |
| --- | --- |
| `GET /api/stations?q=` | Search configured pilot stations. |
| `GET /api/journeys?...` | Return candidate schedules for a validated search. |
| `POST /api/reliability` | Calculate a recommendation, alternatives, statistics, and reason codes. |
| `GET /api/commute` | Load the anonymous session’s saved commute. |
| `POST /api/commute` | Create or replace the anonymous session’s one commute. |
| `GET /api/commute/weekly` | Calculate its seven-day summary. |
| `POST /api/import/mock` | Idempotent development-only mock import. |

Validation and domain errors use `{ "error": { "code": "...", "message": "..." } }` and appropriate 4xx/5xx statuses. Defined cases cover missing journeys/history, invalid times, identical stations, unavailable providers, rate limits, and database failures.

## Testing and quality checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

The unit suite covers all-arrive-on-time, mixed delays, cancellations, low samples, missing/invalid data, transfers, no option reaching the target, tied probabilities, realtime disruption, and a deadline crossing midnight. It also tests Zod validation and the mock provider without PostgreSQL.

Run the browser flow after the database is migrated and seeded:

```bash
npx playwright install chromium
npm run test:e2e
```

The flow opens the landing page, chooses Linköping C → Stockholm Central, sets 08:30, views the recommendation and explanation, saves the commute, and verifies the weekly page.

## Trafiklab integration status

The adapter uses the documented provider interfaces and contains:

- server-only API-key injection;
- authenticated downloads with 15-second timeouts;
- in-process caching (24 hours for static/history and 30 seconds for realtime);
- explicit HTTP 429 handling;
- explicit KoDa HTTP 202 handling with retry guidance;
- official GTFS Sweden 3 static, operator-specific TripUpdates, and KoDa v2 URL construction;
- automatic mock fallback when the primary key is missing.

The implementation follows Trafiklab’s official documentation for [GTFS Sweden 3](https://www.trafiklab.se/api/gtfs-datasets/gtfs-sweden/), [GTFS realtime data](https://www.trafiklab.se/api/gtfs-datasets/overview/realtime-data/), and [KoDa historical data](https://www.trafiklab.se/api/our-apis/koda/).

Real-data calculation is deliberately not fabricated. Before `TRANSPORT_DATA_MODE=trafiklab` can produce recommendations, an importer must:

1. Download and unpack `sweden.zip` and import stops, trips, calendars, and stop times into the local schema.
2. Download operator-specific `TripUpdatesSweden.pb` feeds and decode protobuf messages.
3. Download KoDa `TripUpdates` archives by operator/date, handle on-demand HTTP 202 responses, unpack 7z files, and decode each protobuf snapshot.
4. Match `trip_id` plus service/start date across static, current, and historical sources and materialize `HistoricalJourneyOutcome` rows.
5. Configure all operators needed for a corridor; the pilot crosses local and national operators, and some operators do not publish GTFS-RT TripUpdates in GTFS Sweden 3.

## Trafikverket intercity integration status

`TrafikverketRailDataProvider` uses the official `https://api.trafikinfo.trafikverket.se/v2/data.json` endpoint and `TrainAnnouncement` schema version 1.9. It currently:

- builds filtered XML requests and parses JSON responses with Zod;
- maps all configured stations to verified Trafikverket location signatures;
- matches a departure and destination arrival by advertised train identity and scheduled departure date;
- exposes the railway company and product description without assuming that every train is operated by SJ;
- maps scheduled, estimated, and actual station times, cancellations, and deviation messages;
- reads collected schedules and historical outcomes from PostgreSQL instead of repeatedly requesting months of history during page loads;
- applies 30-second realtime and one-hour historical response caches;
- batches live queries, coalesces duplicate calls, serializes remote requests, and retries HTTP 429 responses using `Retry-After`;
- skips realtime lookups for future weekly forecasts and stops the weekly loop after a persistent provider failure;
- handles unavailable, malformed, and rate-limited responses explicitly.

### Collecting train history

The collector queries all configured station signatures in one bounded request, saves each station announcement idempotently, and groups calls by train identity plus operating date. For every train that passes two configured stations in order, it materializes a direct `ScheduledJourney`. Once the arrival is actual, cancelled, or older than the configured grace period, it also upserts a `HistoricalJourneyOutcome`.

Run the rolling collector locally:

```bash
npm run trains:collect
```

Synchronize direct schedules for the next eight days:

```bash
npm run trains:sync-schedule
```

For a bounded backfill that is available from the API, use explicit windows. Requests are split into day-sized chunks with overlap and are made sequentially:

```bash
npm run trains:collect -- --hours-back=720 --hours-ahead=0 --chunk-hours=24
```

Trafikverket describes this API as realtime data, so old-record retention should not be treated as a guaranteed historical archive. The reliable strategy is to keep the collector running and build the service's own history from this point forward. Raw observations are retained for auditing; the reliability calculation consumes the smaller finalized-outcome table.

### GitHub Actions collector

`.github/workflows/collect-trafikverket.yml` runs the rolling collector every 30 minutes and synchronizes the next eight schedule days once daily. Scheduled workflows run only from GitHub's default branch.

Configure these repository Actions secrets before enabling it:

- `TRAFIKVERKET_API_KEY`
- `DATABASE_URL`

`DATABASE_URL` must point to a PostgreSQL instance reachable from GitHub-hosted runners. A Docker database on `localhost` is suitable for development but cannot be reached by GitHub Actions. Until both secrets exist the jobs exit successfully with a notice and do not call either service. Once configured, the workflow applies committed Prisma migrations before collecting and uses a concurrency group to prevent overlapping collectors.

Use `TRANSPORT_DATA_MODE=trafikverket` for intercity-only rail candidates, or `hybrid` to merge them with Trafiklab candidates. Registration, license acceptance, and an API key are required according to [Trafikverket's official API page](https://www.trafikverket.se/e-tjanster/trafikverkets-oppna-api-for-trafikinformation/). The current object model and endpoint are documented in the [Data Exchange Portal](https://data.trafikverket.se/documentation/datacache/data-model).

The rail adapter and collector currently match direct trains. Production transfer composition should happen after both local GTFS legs and rail announcements are normalized into a shared leg model.

## Adding a station or corridor

1. Add station metadata to `PILOT_STATIONS` in `src/config/pilot.ts`.
2. Add one or more timetable/profile entries to `MOCK_JOURNEY_TEMPLATES`. Keep `externalJourneyId` stable because it is the comparison pattern key.
3. Run `npm run db:seed`; upserts make this safe to repeat.
4. Add an integration fixture/test for the corridor.
5. Add its Trafikverket location signature to `PILOT_STATION_PROVIDER_IDS` when the station serves rail.
6. For real local data, map the station to its GTFS stop area and ensure relevant operator feeds are imported.

No page or algorithm change is required for a new configured corridor.

## Known limitations

- Pilot routes are directional and intentionally do not form a general journey planner.
- Mock schedules are templates rather than a complete public timetable.
- Real Trafiklab ZIP/7z extraction, protobuf decoding, and trip matching remain manual integration work.
- The Trafikverket adapter currently builds direct rail journeys; multi-leg source composition is not yet a general journey planner.
- Current live-response cache is per Node.js process and is not shared across instances; collected records are shared in PostgreSQL.
- Historical confidence for intercity trains starts low and rises as the collector accumulates completed operating days; static timetables alone are never counted as actual outcomes.
- One anonymous commute is stored; there is no account, cross-device sync, or self-service deletion endpoint yet.
- Realtime corrections use a transparent penalty, not stop-by-stop propagation through a transfer chain.
- Weekly predictions calculate on page load rather than from a scheduled materialization job.

## Suggested next steps

1. Deploy durable PostgreSQL and keep the Trafikverket collector healthy long enough to calibrate by operator, train product, corridor, and season.
2. Build the GTFS/GTFS-RT/KoDa ingestion pipeline and normalize its local legs with the collected Trafikverket train announcements.
3. Add optional accounts, commute deletion/export, and multi-device sync after a formal privacy and retention review.

## Project structure

```text
.
├── docker-compose.yml
├── .github/workflows/collect-trafikverket.yml
├── e2e/
│   └── recommendation.spec.ts
├── prisma/
│   ├── migrations/202608060001_init/migration.sql
│   ├── migrations/202608060003_train_announcement_collection/migration.sql
│   ├── migrations/202608070001_harden_public_schema/migration.sql
│   ├── mock-data.ts
│   ├── schema.prisma
│   └── seed.ts
├── src/
│   ├── app/
│   │   ├── api/{stations,journeys,reliability,commute,import}/
│   │   ├── integritet/
│   │   ├── metod/
│   │   ├── pendling/
│   │   ├── resultat/
│   │   ├── globals.css
│   │   └── page.tsx
│   ├── components/
│   ├── config/pilot.ts
│   ├── domain/
│   ├── lib/
│   │   ├── reliability/
│   │   ├── time.ts
│   │   └── validation.ts
│   ├── providers/
│   │   ├── trafiklab-transport-data-provider.ts
│   │   ├── trafikverket-rail-data-provider.ts
│   │   └── hybrid-transport-data-provider.ts
│   └── services/
├── scripts/collect-trafikverket.ts
├── .env.example
├── eslint.config.mjs
├── next.config.ts
├── package.json
├── playwright.config.ts
├── prisma.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── vitest.config.ts
```
