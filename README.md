# 🚀 IncidentFlow: Mission-Critical Incident Management System

## 📋 Executive Summary
**IncidentFlow** is an enterprise-grade, full-stack Incident Management System (IMS) designed to handle high-throughput signal ingestion, automated incident routing, and reliable resolution workflows. Built for high availability, the system ensures zero data loss during traffic bursts by utilizing an asynchronous messaging architecture, resilient database strategies, and real-time frontend observability.

This project guarantees robust processing through advanced engineering patterns such as **Debouncing**, **Strategy-based alerting**, **State-machine governed workflows**, and **Circuit Breakers**.

---

## 🏗️ Architecture Diagram

                         ┌───────────────────────────┐
                         │   External Systems / APIs │
                         │   (Producers)             │
                         └─────────────┬─────────────┘
                                       │
                                       │  POST /signals
                                       ▼
                         ┌───────────────────────────┐
                         │   Backend API (Express)   │
                         │   Node.js Server          │
                         └─────────────┬─────────────┘
                                       │
                  ┌────────────────────┼────────────────────┐
                  │                    │                    │
                  │                    │                    │
                  ▼                    ▼                    ▼
        ┌───────────────┐    ┌────────────────┐    ┌────────────────┐
        │  Redis Cache  │    │  Debounce Logic │    │  RabbitMQ Queue│
        │ (Hot Path)    │    │  (Duplicate     │    │  "signals"     │
        │               │    │   Filtering)    │    │                │
        └──────┬────────┘    └────────┬───────┘    └────────┬───────┘
               │                      │                     │
               │                      │                     │
               │                      │         (Async / Non-blocking)
               │                      │                     │
               │                      └──────────────┬──────┘
               │                                     │
               │                                     ▼
               │                         ┌───────────────────────────┐
               │                         │      Worker Service       │
               │                         │      (worker.js)          │
               │                         └─────────────┬─────────────┘
               │                                       │
               │                 ┌─────────────────────┼─────────────────────┐
               │                 │                     │                     │
               ▼                 ▼                     ▼                     ▼
      ┌───────────────┐  ┌────────────────┐   ┌────────────────┐   ┌────────────────┐
      │   MongoDB     │  │ Incident Logic │   │ Alert Strategy │   │ Re-Queue Logic │
      │ (Signals +    │  │ (Create/Update)│   │ (P0 / P2 etc.) │   │ (Race Handling)│
      │  Incidents)   │  └────────────────┘   └────────────────┘   └────────────────┘
      └───────────────┘            │                     │
                                   │                     │
                                   ▼                     ▼
                           ┌───────────────┐    ┌──────────────────┐
                           │   Incidents   │    │ Slack / Webhooks │
                           │   Collection  │    │ Notifications     │
                           └───────────────┘    └──────────────────┘


        ...........................................................................

                         ┌───────────────────────────┐
                         │   React Frontend (UI)     │
                         │   Dashboard               │
                         └─────────────┬─────────────┘
                                       │
                                       │  GET /incidents (Every 5s)
                                       ▼
                         ┌───────────────────────────┐
                         │   Backend API             │
                         │   (Reads from Cache)      │
                         └─────────────┬─────────────┘
                                       │
                                       ▼
                              ┌────────────────┐
                              │   Redis Cache  │
                              │   (TTL 10s)    │
                              └────────────────┘


        ...........................................................................

                         ┌───────────────────────────┐
                         │  Observability Layer      │
                         ├───────────────────────────┤
                         │  /metrics  → Prometheus   │
                         │  /health   → Health Check │
                         └───────────────────────────┘

## ⚙️ System Architecture & Tech Stack

The architecture is divided into three main operational components: the React-based Frontend Dashboard, the high-throughput Express.js Backend API, and an asynchronous processing RabbitMQ Worker. 

### 🖥️ Frontend (Client-side)
A fast, reactive single-page application that provides a live feed of incidents and allows engineers to resolve issues and submit Root Cause Analysis (RCA) reports.
- **Core Framework:** React (v19.2.5), React DOM (v19.2.5)
- **Build Tool:** Vite
- **Functionality:** Real-time auto-refreshing dashboard, interactive RCA forms, and test-signal generators.

### ⚙️ Backend (Server-side)
A robust REST API designed to ingest up to 10,000 signals/sec without blocking, thanks to its decoupling with RabbitMQ and Redis caching.
- **Core Runtime:** Node.js
- **Framework:** Express (v5.2.1)
- **Message Broker Integration:** `amqplib` - Connects to RabbitMQ for asynchronous job queueing and guaranteed delivery.
- **Database ORM:** Mongoose (v9.6.1) - Manages MongoDB data modeling, schemas, and queries.
- **Metrics & Observability:** `prom-client` (v15.0.0) - Exposes Prometheus-compatible metrics for monitoring.
- **Caching & Rate Limiting:** `redis` (v5.12.1) - Caches API responses and handles distributed debounce states.
- **SQL Driver:** `pg` (v8.20.0) - PostgreSQL integration for secondary data and connection pooling utilities.
- **Middleware:** `cors`, `body-parser`, `express-rate-limit`

### 🗄️ Infrastructure & Databases (Dockerized)
- **MongoDB:** Primary data lake for raw signals and source of truth for structured Incidents.
- **PostgreSQL:** Relational database available for legacy/pooling integrations.
- **Redis:** High-speed in-memory store utilized for 10-second TTL caching and flood prevention.
- **RabbitMQ:** Resilient message broker ensuring zero message loss between API ingestion and worker processing.

---

## 🔄 Complete Project Workflow

The Incident Management System follows a strict, highly resilient pipeline to ensure no data is lost during traffic bursts and incidents are handled with a rigorous audit trail.

### 1. High-Throughput Ingestion (The Producer)
- External systems (APIs, RDBMS, Caches) send JSON SOS payloads to the `POST /signals` endpoint.
- **Debouncing:** The `DebounceManager` intercepts floods of duplicate signals. If 100 identical signals arrive within 10 seconds, the 1st signal proceeds normally, and the next 99 are tagged as duplicates.
- **Zero-Blocking:** To handle maximum throughput, the Express API does *not* write to the database synchronously. It immediately pushes all verified signals into the fast, in-memory **RabbitMQ** `signals` queue and responds to the client in milliseconds.

### 2. Processing & Persistence (The Sink Worker)
- The asynchronous `worker.js` script constantly pulls pending signals from RabbitMQ.
- **The Data Lake:** Every single raw payload (including duplicates) is immediately committed to the MongoDB `Signal` collection as an immutable audit log.
- **The Source of Truth:** The worker evaluates the signals. For the 1st unique signal, it generates a new structured Work Item in the MongoDB `Incident` collection. For duplicate signals, it seamlessly finds the active incident and links their unique IDs to the incident's array.
- **Race Condition Safety:** If duplicates arrive at the worker *before* the 1st signal finishes creating the incident in MongoDB, the worker safely rejects them back into RabbitMQ to be re-queued and processed later.

### 3. Strategy Alerting & Triage
- The worker evaluates the severity of the signal. Using the **Strategy Pattern**, it dynamically switches between alerting logic (e.g., `P0Strategy` for critical database failures vs. `P2Strategy` for medium cache failures) to notify the correct responders via Slack or external Webhooks.

### 4. Live Dashboard (The Hot-Path)
- The React Frontend automatically fetches the Live Feed every 5 seconds.
- **Redis Caching:** To protect MongoDB from auto-refresh spam from multiple clients, the backend `GET /incidents` endpoint caches the dashboard state in Redis with a 10-second TTL.

### 5. Mandatory Workflow & RCA (State Pattern)
- Engineers review the incident and fill out a dedicated RCA (Root Cause Analysis) form in the UI.
- Using the **State Pattern**, the backend strictly governs the lifecycle (`Open → Investigating → Resolved → Closed`).
- **Validation:** If the engineer clicks "Save RCA" but forgets to fill out the Incident Start/End times or Prevention Steps, the system throws an error and permanently blocks the transition to "Closed".
- **MTTR Calculation:** Once successfully validated, the system automatically subtracts the `startAt` time of the first signal from the `endAt` time of the RCA submission to log the official Mean Time To Repair (MTTR) metrics.

### 6. Handling Backpressure (Resilience)
Backpressure is actively managed to ensure the system does not collapse under a flood of concurrent failure signals:
- **Decoupled Architecture:** The API server *never* writes directly to the database synchronously. By pushing messages to RabbitMQ, the API can respond in milliseconds, shedding load instantly.
- **RabbitMQ Prefetching:** The worker uses `channel.prefetch(50)`, which strictly limits it to processing 50 signals at a time. If the worker is overwhelmed, RabbitMQ absorbs the backpressure by holding the messages in the queue rather than crashing the Node process.
- **Redis Debouncing:** Duplicate signals are squashed at the edge using Redis, dropping redundant writes before they even enter the queue.
- **Connection Pools:** MongoDB and PostgreSQL connections are strictly pooled to prevent database connection exhaustion during traffic bursts.

---

## 🚀 Local Setup & Installation

### Prerequisites
- **Docker Desktop** (includes Docker Engine + Docker Compose)
- **Node.js** (v18+ / v20+ recommended for local development)

### Automated Setup (Recommended)
Deploy the entire stack (Frontend, Backend, and all 4 Databases/Brokers) with one command.

**Windows:**
```bash
.\setup.bat
```

**macOS/Linux:**
```bash
chmod +x setup.sh
./setup.sh
```
*This script will create your `.env` file, install all NPM dependencies for both frontend and backend, and build/start the Docker containers in the background.*

### Manual Setup

```bash
cp .env.example .env
docker-compose up -d --build
```

### URLs & Ports
- **Frontend Application:** `http://localhost:5173`
- **Backend API & Health:** `http://localhost:8081/health`
- **Prometheus Metrics:** `http://localhost:8081/metrics`
- **RabbitMQ Dashboard:** `http://localhost:15672` (Credentials: `guest` / `guest`)

---

## 📡 API Reference Overview

The Express backend exposes a well-documented REST API:

- `POST /signals` - Ingest a new system signal (Debounced, Enqueued)
- `GET /incidents` - Retrieve all active incidents (Redis Cached)
- `GET /incidents/:id` - Fetch detailed incident data, including related raw signals
- `POST /incidents/:id/resolve` - Transition state to Resolved, triggering notifications
- `POST /incidents/:id/rca` - Attach Root Cause Analysis details to an incident
- `GET /health` - Comprehensive system health check (DB, Cache, Queue connectivity)
- `GET /metrics` - Exports system and application metrics for Prometheus scraping

---

## 📁 Repository Structure

```
IncidentFlow/
├── Backend/
│   ├── index.js            # Express API Server Entrypoint
│   ├── worker.js           # RabbitMQ Message Consumer
│   ├── models/             # Mongoose Schemas (Incident, Signal)
│   ├── utils/              # Resiliency Patterns (Circuit Breaker, Debouncer, Cache)
│   └── package.json        # Backend Dependencies
├── frontend/
│   ├── src/                # React App Source Code
│   ├── public/             # Static Assets
│   └── package.json        # Frontend Dependencies
├── docker-compose.yml      # Infrastructure Definitions (Mongo, Postgres, Redis, AMQP)
├── .env.example            # Environment Variable Templates
└── setup.bat / setup.sh    # One-click Installation Scripts
```

*Built with precision and robust software engineering practices to ensure high-availability monitoring.*
