# High-Throughput Metrics Pipeline

A proof-of-concept data pipeline for ingesting and storing IoT sensor metrics at
scale, achieving 40-50k inserts/second with minimal optimization.

<details>
<summary>
Expand: <strong>Table of Contents</strong>
</summary>

## Table of Contents

- [High-Throughput Metrics Pipeline](#high-throughput-metrics-pipeline)
  - [Table of Contents](#table-of-contents)
  - [Quick Start](#quick-start)
  - [Architecture](#architecture)
    - [Key Features](#key-features)
    - [Kafka Key → PostgreSQL Upsert Mapping](#kafka-key--postgresql-upsert-mapping)
  - [Data Model](#data-model)
    - [Metrics Table](#metrics-table)
    - [Schema](#schema)
  - [Performance Configuration](#performance-configuration)
    - [PostgreSQL Tuning](#postgresql-tuning)
    - [Kafka Connect Sink](#kafka-connect-sink)
    - [Producer Settings](#producer-settings)
  - [Getting Started](#getting-started)
    - [Prerequisites](#prerequisites)
    - [Environment Setup](#environment-setup)
    - [Run the Stack](#run-the-stack)
    - [Startup Flow](#startup-flow)
    - [Service Health](#service-health)
  - [Project Structure](#project-structure)
  - [Monitoring](#monitoring)
    - [Redpanda Console](#redpanda-console)
    - [Database Metrics](#database-metrics)
  - [Configuration Reference](#configuration-reference)
    - [Producer Environment Variables](#producer-environment-variables)
  - [Development](#development)
    - [Running Migrations](#running-migrations)
    - [Local Development](#local-development)
  - [Performance Optimization Opportunities](#performance-optimization-opportunities)
    - [Potential Improvements](#potential-improvements)
  - [Troubleshooting](#troubleshooting)
    - [Connector Issues](#connector-issues)
    - [High Memory Usage](#high-memory-usage)
    - [Slow Inserts](#slow-inserts)
  - [License](#license)
  - [Acknowledgments](#acknowledgments)

</details>

## Quick Start

Start the full pipeline and initialize the PostgreSQL sink connector with a
single command:

```sh
docker compose up -d
```

This brings up all required services and bootstraps the Kafka Connect
configuration automatically.

## Architecture

This system demonstrates a modern streaming architecture using:

- **Redpanda** (Kafka-compatible) for message streaming
- **Kafka Connect** for automated PostgreSQL sink
- **PostgreSQL 17** with optimized configuration for high write throughput
- **TypeScript/Bun** producer for metrics generation

```txt
┌─────────────┐        ┌──────────┐        ┌────────────────┐        ┌────────────┐
│   Producer  │ ─────> │ Redpanda │ ─────> │ Kafka Connect  │ ─────> │ PostgreSQL │
│  (Node.js)  │        │  (Kafka) │        │  (JDBC Sink)   │        │    (17)    │
└─────────────┘        └──────────┘        └────────────────┘        └────────────┘
```

### Key Features

- **40-50k inserts/second** throughput (unoptimized baseline)
- Composite primary key design for distributed write performance
- JSON Schema integration for type-safe message serialization
- Automatic topic and connector provisioning
- Graceful shutdown handling with health checks
- Docker Compose orchestration with proper service dependencies

### Kafka Key → PostgreSQL Upsert Mapping

Each Kafka message key encodes the composite primary key (`device_id`,
`metric_name`, `published_at`). Kafka Connect uses this key to generate
`INSERT ... ON CONFLICT` statements, enabling idempotent upserts without custom
consumer logic.

This design allows the database schema to define uniqueness while keeping the
stream stateless.

> [!NOTE] Baseline Performance
>
> The reported throughput is achieved on a single-node setup without table
> partitioning, compression tuning, or horizontal scaling. The goal is to
> demonstrate architectural efficiency before advanced optimizations.

## Data Model

### Metrics Table

The metrics table uses a composite primary key to distribute writes across the
B-tree index:

```sql
PRIMARY KEY (device_id, published_at, metric_name)
```

This design prevents write contention on a single index page, enabling high
concurrent insert rates.

> [!WARNING] Primary Key Write Contention
>
> While the composite primary key enables idempotent upserts, it can become a
> write bottleneck at higher concurrency levels due to index page contention.
> This is an intentional baseline trade-off and a candidate for optimization via
> staging tables, partitioning, or alternative uniqueness strategies.

**Supported Metrics:**

- Temperature (0)
- Humidity (10)
- Pressure (20)
- CO2 (30)
- Light (40)
- Sound (50)

> [!TIP] Why `metric_name` is a `smallint`
>
> `metric_name` was originally modeled as a PostgreSQL enum. It was later
> changed to a `smallint` because the Kafka Connect JDBC sink does not reliably
> support PostgreSQL enums (an issue that has existed for several major versions
> and remains unresolved).
>
> Using a numeric code avoids connector failures, simplifies schema evolution,
> and keeps message serialization fully compatible with Kafka Connect’s
> primitive type system, while preserving efficient indexing.

### Schema

```typescript
{
  device_id: uuid,
  published_at: timestamp,
  metric_name: smallint,
  value: double precision,
  tags: text[],
  created_at: timestamp
}
```

## Performance Configuration

### PostgreSQL Tuning

Optimized for high-throughput writes:

```yaml
shared_buffers: 8GB
wal_buffers: 64MB
max_wal_size: 4GB
effective_cache_size: 24GB
work_mem: 64MB
maintenance_work_mem: 2GB
checkpoint_completion_target: 0.9
```

> [!IMPORTANT] Environment Assumptions
>
> The provided PostgreSQL tuning values assume a development machine with ≥32 GB
> RAM and fast local storage. For smaller environments, these values should be
> reduced proportionally to avoid memory pressure.

### Kafka Connect Sink

Configured for batch efficiency:

```json
{
  "batch.size": 2500,
  "consumer.fetch.min.bytes": 1048576,
  "consumer.max.poll.records": 5000,
  "tasks.max": 6
}
```

### Producer Settings

- **Batch size**: 250 messages per Kafka send
- **Max in-flight requests**: 5
- **Queue concurrency**: 8 parallel batch sends
- **Publish interval**: 250ms (2.5k-7.5k metrics per batch)

## Getting Started

### Prerequisites

- Docker and Docker Compose
- Bun runtime (for local development)

### Environment Setup

Create a `.env` file:

```env
# PostgreSQL
POSTGRES_DB=postgres
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_secure_password
POSTGRES_URL=postgresql://postgres:your_secure_password@pg.lokal:5432/postgres

# Kafka
KAFKA_URL=kafka.lokal:19092

# Optional: Override defaults
PRODUCER_MIN_METRICS=2500
PRODUCER_MAX_METRICS=7500
KAFKA_BATCH_SIZE=250
TOPIC_PARTITIONS_METRICS=6
```

### Run the Stack

```bash
# Start all services
docker compose up -d

# View logs
docker compose logs -f producer

# Access Redpanda Console
open http://localhost:9090

# Access pgAdmin
open http://localhost:8000
```

### Startup Flow

Services are started in a strict dependency order to ensure safe ingestion:

1. PostgreSQL starts and becomes healthy
2. Database migrations are applied
3. The producer creates the Kafka topic if needed
4. Kafka Connect starts after all upstream services are ready
5. The JDBC sink connector is registered (or updated) idempotently

This guarantees that no messages are consumed before the schema and topics are
fully initialized.

### Service Health

All services include health checks:

- **PostgreSQL**: `pg_isready`
- **Redpanda**: Status endpoint on `:9644`
- **Producer**: HTTP endpoint on `:3000/health`
- **Kafka Connect**: REST API on `:8083`

## Project Structure

```txt
.
├── services/
│   ├── postgres.compose.yaml    # PostgreSQL + pgAdmin
│   ├── redpanda.compose.yaml    # Redpanda, Console, Connect
│   └── node.compose.yaml        # Producer service
├── src/
│   ├── producer/                # Kafka producer implementation
│   ├── db/
│   │   ├── schema.ts           # Drizzle ORM schema
│   │   ├── migrations/         # Database migrations
│   │   └── domains.ts          # Zod validation schemas
│   ├── config/                 # Environment configuration
│   └── lib/                    # Utilities
└── docker-compose.yaml
```

## Monitoring

### Redpanda Console

Access at `http://localhost:9090` to view:

- Topic throughput and lag
- Consumer group status
- Message inspection
- Connector status

### Database Metrics

Connect to PostgreSQL and query:

```sql
-- Total metrics ingested
SELECT COUNT(*) FROM metrics;

-- Metrics per device
SELECT device_id, COUNT(*) as metric_count
FROM metrics
GROUP BY device_id
ORDER BY metric_count DESC;

-- Recent ingestion rate
SELECT
  DATE_TRUNC('minute', created_at) as minute,
  COUNT(*) as inserts
FROM metrics
WHERE created_at > NOW() - INTERVAL '10 minutes'
GROUP BY minute
ORDER BY minute DESC;
```

## Configuration Reference

### Producer Environment Variables

| Variable                     | Default | Description                         |
| ---------------------------- | ------- | ----------------------------------- |
| `PRODUCER_QUEUE_CONCURRENCY` | 8       | Parallel batch send operations      |
| `PRODUCER_MIN_METRICS`       | 2500    | Minimum metrics per publish cycle   |
| `PRODUCER_MAX_METRICS`       | 7500    | Maximum metrics per publish cycle   |
| `PRODUCER_MIN_DEVICES`       | 3       | Minimum device count per batch      |
| `PRODUCER_MAX_DEVICES`       | 10      | Maximum device count per batch      |
| `KAFKA_BATCH_SIZE`           | 250     | Messages per Kafka send operation   |
| `KAFKA_MAX_IN_FLIGHT`        | 5       | Maximum concurrent requests         |
| `PRODUCER_PUBLISH_INTERVAL`  | 250     | Milliseconds between publish cycles |
| `TOPIC_PARTITIONS_METRICS`   | 6       | Number of topic partitions          |

## Development

### Running Migrations

```bash
# Run migrations
bun run db:migrate

# Generate new migration
bun run db:generate
```

### Local Development

```bash
# Install dependencies
bun install

# Run producer locally (requires Kafka/Postgres)
bun run src/producer/index.ts
```

## Performance Optimization Opportunities

Current throughput: **40-50k inserts/second** (baseline)

### Potential Improvements

1. **Connection pooling**: Increase Kafka Connect worker threads
2. **Batch sizing**: Tune `batch.size` and `consumer.max.poll.records`
3. **Partitioning**: Add more topic partitions (currently 6)
4. **PostgreSQL**: Enable unlogged tables for non-critical data
5. **Compression**: Enable Kafka message compression
6. **Hardware**: Scale horizontally with multiple Redpanda brokers
7. **Staging / transitional table**: Ingest into a narrow, append-only staging
   table optimized for write speed, then asynchronously transform and move data
   into the final `metrics` table.
8. **Index strategy refinement**: Rework unique indexing to reduce write
   contention (e.g. deferred index creation, partial indexes, or hash-based
   routing keys).
9. **Time-series specialization**: Replace or augment PostgreSQL with
   TimescaleDB for native time-series partitioning, compression, and retention
   policies.

> [!NOTE] Scope Boundary
>
> This proof-of-concept intentionally targets plain PostgreSQL to establish a
> clear performance baseline. Time-series extensions such as TimescaleDB are
> considered a follow-up step once ingestion characteristics and access patterns
> are well understood.

## Troubleshooting

### Connector Issues

```bash
# Check connector status
curl http://localhost:8083/connectors/metrics-postgres-sink/status

# Restart connector
docker compose restart connect_init
```

### High Memory Usage

Adjust PostgreSQL settings in `services/postgres.compose.yaml` based on
available RAM.

### Slow Inserts

Check for:

- Index bloat: `REINDEX TABLE metrics;`
- Autovacuum settings
- Disk I/O bottlenecks

## License

MIT

## Acknowledgments

Built with:

- [Redpanda](https://redpanda.com) - Kafka-compatible streaming platform
- [Drizzle ORM](https://orm.drizzle.team) - TypeScript ORM
- [Bun](https://bun.sh) - Fast JavaScript runtime
- [Kafka Connect](https://kafka.apache.org/documentation/#connect) - Distributed
  integration framework
