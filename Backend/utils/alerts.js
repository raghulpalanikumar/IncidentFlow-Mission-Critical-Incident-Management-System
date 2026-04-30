/**
 * Alert Notification Service
 * Sends alerts to Slack, webhooks, or other channels
 */

const axios = require("axios");

class AlertService {
  constructor(config = {}) {
    this.slackWebhook = config.slackWebhook || process.env.SLACK_WEBHOOK_URL;
    this.webhookUrl = config.webhookUrl || process.env.WEBHOOK_URL;
    this.enabled = config.enabled !== false;
  }

  /**
   * Send Slack notification
   */
  async sendSlack(message, incident = null) {
    if (!this.slackWebhook || !this.enabled) {
      return { success: false, reason: "Slack not configured" };
    }

    try {
      const payload = {
        text: message,
        attachments: [],
      };

      if (incident) {
        payload.attachments.push({
          color: this.getSeverityColor(incident.severity),
          title: `Incident: ${incident.id}`,
          fields: [
            { title: "Severity", value: incident.severity, short: true },
            {
              title: "Status",
              value: incident.status || "open",
              short: true,
            },
            {
              title: "Description",
              value: incident.description || "N/A",
              short: false,
            },
            {
              title: "Created At",
              value: new Date(incident.createdAt).toISOString(),
              short: true,
            },
          ],
        });
      }

      await axios.post(this.slackWebhook, payload, {
        timeout: 5000,
      });

      console.log("✅ Slack alert sent");
      return { success: true };
    } catch (error) {
      console.error("❌ Slack alert failed:", error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send webhook notification
   */
  async sendWebhook(data, metadata = {}) {
    if (!this.webhookUrl || !this.enabled) {
      return { success: false, reason: "Webhook not configured" };
    }

    try {
      const payload = {
        timestamp: new Date().toISOString(),
        data,
        metadata,
      };

      await axios.post(this.webhookUrl, payload, {
        timeout: 5000,
      });

      console.log("✅ Webhook sent");
      return { success: true };
    } catch (error) {
      console.error("❌ Webhook failed:", error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send critical incident alert (to all channels)
   */
  async alertCritical(incident) {
    const message = `🚨 CRITICAL INCIDENT: ${incident.description}`;

    const results = await Promise.all([
      this.sendSlack(message, incident),
      this.sendWebhook(incident, { type: "critical_incident" }),
    ]);

    return results;
  }

  /**
   * Send resolution notification
   */
  async alertResolved(incident, mttr) {
    const message = `✅ RESOLVED: ${incident.description} (MTTR: ${mttr}s)`;

    const results = await Promise.all([
      this.sendSlack(message, incident),
      this.sendWebhook(incident, { type: "incident_resolved", mttr }),
    ]);

    return results;
  }

  getSeverityColor(severity) {
    const colors = {
      critical: "danger",
      high: "warning",
      medium: "#FFA500",
      low: "good",
    };
    return colors[severity] || "#808080";
  }
}

module.exports = { AlertService };
