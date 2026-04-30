class IncidentState {
  constructor(incident) {
    this.incident = incident;
  }
  next(status) {
    throw new Error("Method not implemented");
  }
}

class OpenState extends IncidentState {
  next(status) {
    if (status === "investigating") {
      this.incident.status = "investigating";
      this.incident.state = new InvestigatingState(this.incident);
    } else if (status === "resolved") {
      this.incident.status = "resolved";
      this.incident.timeline.resolvedAt = new Date();
      this.incident.state = new ResolvedState(this.incident);
    } else {
      throw new Error(`Cannot transition from open to ${status}`);
    }
  }
}

class InvestigatingState extends IncidentState {
  next(status) {
    if (status === "resolved") {
      this.incident.status = "resolved";
      this.incident.timeline.resolvedAt = new Date();
      this.incident.state = new ResolvedState(this.incident);
    } else {
      throw new Error(`Cannot transition from investigating to ${status}`);
    }
  }
}

class ResolvedState extends IncidentState {
  next(status) {
    if (status === "closed") {
      if (!this.incident.validateRCA()) {
        throw new Error("Cannot close incident without a valid RCA");
      }
      this.incident.status = "closed";
      this.incident.state = new ClosedState(this.incident);
    } else if (status === "investigating" || status === "open") {
      this.incident.status = status;
      this.incident.timeline.resolvedAt = null;
      this.incident.state = status === "open" ? new OpenState(this.incident) : new InvestigatingState(this.incident);
    } else {
      throw new Error(`Cannot transition from resolved to ${status}`);
    }
  }
}

class ClosedState extends IncidentState {
  next(status) {
    throw new Error("Incident is closed and cannot transition to other states.");
  }
}

function initializeState(incident) {
  switch (incident.status) {
    case "open": return new OpenState(incident);
    case "investigating": return new InvestigatingState(incident);
    case "resolved": return new ResolvedState(incident);
    case "closed": return new ClosedState(incident);
    default: return new OpenState(incident);
  }
}

module.exports = {
  initializeState,
  OpenState,
  InvestigatingState,
  ResolvedState,
  ClosedState
};
