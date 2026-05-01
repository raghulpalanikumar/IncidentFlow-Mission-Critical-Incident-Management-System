# Prompts, Specs, and System Plans

This file documents the specifications, design decisions, and prompts used during the creation of **IncidentFlow**.

## 1. Initial Prompt & Specifications
**Objective**: Build a mission-critical Incident Management System (IMS) that handles high-throughput signals without dropping data.

**Key Requirements Passed to System:**
- "Create an Express.js backend that ingests alerts from external systems at a high velocity."
- "Implement a RabbitMQ worker to decouple the ingestion API from the database writes to ensure zero-blocking and high availability."
- "Create a React-based frontend dashboard that auto-refreshes to show the live state of incidents."
- "Ensure no data is lost during sudden bursts of traffic using caching, debouncing, and message brokers."

## 2. Architectural Decisions & Planning
- **The Debouncer Plan**: To protect the worker from being overwhelmed by duplicate "Database down" alerts, a Redis-backed DebounceManager was planned. This ensures that 100 identical signals in a 10-second window only result in 1 structured Incident, while preserving all 100 raw signals in MongoDB for auditing.
- **Backpressure Handling Plan**: We utilized RabbitMQ's `channel.prefetch(50)` to ensure the Node.js worker process only takes what it can handle, pushing backpressure into the message queue rather than crashing the memory heap.
- **Design Patterns Utilized**:
  - *Strategy Pattern*: Applied to the Alerting system to dynamically switch logic based on signal severity.
  - *State Pattern*: Applied to the Incident Lifecycle (`Open → Investigating → Resolved → Closed`) ensuring strict compliance for RCA (Root Cause Analysis) completion.

## 3. Subsequent Refinement Prompts
- "Add a Root Cause Analysis (RCA) strict validation before allowing an incident to be closed."
- "Implement Prometheus metrics tracking for MTTR (Mean Time To Repair) and queue depth."
- "Update the docker-compose to include Postgres, MongoDB, Redis, and RabbitMQ with strict health checks and restart policies."
- "Rewrite the README.md to be highly professional, including the architecture diagram and a dedicated section on Backpressure handling."

*All original planning documents and prompt iterations have been synthesized into this repository to represent the complete engineering lifecycle of the project.*
