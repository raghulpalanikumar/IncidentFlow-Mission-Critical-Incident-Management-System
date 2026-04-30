class AlertStrategy {
  async send(alertService, incident) {
    throw new Error("Method 'send()' must be implemented.");
  }
}

class P0Strategy extends AlertStrategy {
  async send(alertService, incident) {
    const msg = `🚨 P0 CRITICAL: RDBMS/System Failure! ${incident.description}`;
    return await alertService.alertCritical({ ...incident, description: msg });
  }
}

class P2Strategy extends AlertStrategy {
  async send(alertService, incident) {
    const msg = `⚠️ P2 WARNING: Cache/Component Failure. ${incident.description}`;
    return await alertService.sendSlack(msg, incident);
  }
}

class DefaultStrategy extends AlertStrategy {
  async send(alertService, incident) {
    const msg = `🔔 ALERT: ${incident.description}`;
    return await alertService.sendSlack(msg, incident);
  }
}

class AlertContext {
  constructor(strategy) {
    this.strategy = strategy || new DefaultStrategy();
  }
  setStrategy(strategy) {
    this.strategy = strategy;
  }
  async executeStrategy(alertService, incident) {
    return await this.strategy.send(alertService, incident);
  }
}

module.exports = {
  AlertStrategy,
  P0Strategy,
  P2Strategy,
  DefaultStrategy,
  AlertContext
};
