#!/bin/bash

# IncidentFlow - Mock Failure Event Simulation
# This script simulates a cascading failure across the stack.
# 1. First, an RDBMS outage occurs (simulating database connection timeouts)
# 2. Then, an MCP (Mission Control Panel) failure occurs as a downstream effect.
# 3. We send multiple duplicate signals to demonstrate the Debouncer handling burst traffic.

API_URL="http://localhost:8081/signals"

echo "🔥 Initiating Mock Failure Event Simulation..."
echo "------------------------------------------------"

# Step 1: Simulate RDBMS Outage (Database Connection Timeout)
echo "🚨 Sending initial RDBMS connection failure signal (Critical)..."
curl -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "exception",
    "source": "postgresql-primary",
    "severity": "critical",
    "description": "CRITICAL: Connection pool exhausted. DB Outage detected."
  }'
echo ""
sleep 1

# Step 2: Simulate Burst Traffic (Debouncer testing)
echo "⚡ Sending 5 duplicate RDBMS failure signals to test Debouncer/Backpressure..."
for i in {1..5}
do
  curl -X POST "$API_URL" \
    -H "Content-Type: application/json" \
    -d '{
      "type": "exception",
      "source": "postgresql-primary",
      "severity": "critical",
      "description": "CRITICAL: Connection pool exhausted. DB Outage detected."
    }' &
done
wait
echo ""
echo "✅ Burst sent. Only the first signal should create an Incident; the rest are grouped."
sleep 2

# Step 3: Simulate Downstream MCP Failure
echo "🚨 Sending downstream MCP (Mission Control Panel) cascade failure..."
curl -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "error",
    "source": "mcp-dashboard-service",
    "severity": "high",
    "description": "HIGH: Cannot connect to primary database. Dashboard rendering failed."
  }'
echo ""

echo "------------------------------------------------"
echo "✅ Simulation Complete! Check your frontend dashboard to see the aggregated incidents."
