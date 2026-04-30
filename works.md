# Incident Management System (IMS) - Project Analysis

This project is a full-stack **Incident Management System** designed to ingest, process, and manage system alerts and errors (signals), grouping them into trackable incidents. 

Here is a breakdown of what the system does and its complete data flow.

## 1. Backend (Node.js + Express + RabbitMQ + MongoDB)
The backend is responsible for receiving signals, queuing them for reliable processing, and grouping them into incidents.

* **API Server (`index.js`):** 
  * Exposes a `POST /signals` endpoint to receive system alerts (signals). 
  * It includes rate-limiting and debouncing (to ignore rapid duplicate signals).
  * Stores the raw signal in MongoDB and publishes a message to a **RabbitMQ** queue (`signals`).
  * Exposes endpoints to fetch, resolve, and update incidents (`GET /incidents`, `POST /incidents/:id/rca`).
* **Worker Process (`worker.js`):** 
  * Runs in the background and listens to the RabbitMQ `signals` queue.
  * When a signal is picked up, it determines its severity.
  * **Aggregation:** It checks MongoDB to see if an active incident already exists for that specific source within the last 10 minutes.
  * If an incident exists, it attaches the new signal to it. If not, it creates a new **Incident**.
  * It triggers alerts for `high` or `critical` incidents.

## 2. Frontend (React + Vite)
The frontend is a dashboard application for monitoring and managing these incidents.

* **Live Feed:** A real-time updating list of active incidents. Users can search and filter by status (Open, Investigating, Resolved, Closed) and severity (Critical, High, Medium, Low).
* **Incident Detail:** When an incident is clicked, the user can see all the aggregated raw signals attached to it, including their JSON metadata.
* **RCA Form (Root Cause Analysis):** Allows engineers to document the resolution of an incident by detailing the root cause, fix applied, and prevention steps.
* **Send Signal:** A testing utility built into the UI to manually dispatch mock signals to the backend to see how the system handles them.

## 3. Infrastructure & Deployment (Docker Compose)
The entire system is containerized and orchestrated using `docker-compose.yml`. It spins up all necessary services in an isolated bridge network (`ims-network`):

* **backend:** Runs the API server (`index.js`) on port `8080` (mapped to `8081` on the host).
* **worker:** Runs the background task processor (`worker.js`).
* **frontend:** Serves the React UI via Vite on port `5173`.
* **postgres:** A PostgreSQL database (for structured/relational data, if needed by the system).
* **mongodb:** The main NoSQL database holding the unstructured Signals and Incidents.
* **redis:** Used for caching and rate-limiting/debouncing signals.
* **rabbitmq:** The message broker handling the `signals` and `incidents` queues.

All services are configured with health checks, memory/CPU limits, and automatic restarts, making the system highly resilient.

---

## 🔁 The Complete Flow

1. **Signal Generation:** An external service experiences an error (or a user manually submits one via the frontend "Send Signal" tab) and sends a JSON payload to the backend `POST /signals`.
2. **Ingestion & Queuing:** The backend receives the signal, debounces duplicates, saves it to MongoDB, and pushes it to RabbitMQ to ensure no data is lost during high traffic.
3. **Worker Processing:** The `worker.js` pulls the signal from RabbitMQ. It groups related signals together to prevent alert fatigue. If it's a new issue, a new Incident is created.
4. **Dashboard Update:** The frontend, which auto-refreshes every 5 seconds, fetches the latest incidents from the backend and displays the newly created incident in the **Live Feed**.
5. **Investigation:** An engineer notices the incident, clicks it, and investigates the attached JSON metadata and signals in the **Incident Detail** tab.
6. **Resolution & RCA:** Once the issue is fixed, the engineer uses the **RCA Form** to write a Root Cause Analysis, saving the prevention steps and marking the incident timeline.
