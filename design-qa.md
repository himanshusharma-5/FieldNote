# Fieldnote implementation and interaction QA

## Product

Fieldnote is a full-stack portfolio project for replaying a fictional software-service incident. The visual direction stays calm and minimal: a readable incident timeline, evidence provenance, competing explanations, decisions with evidence snapshots, and team handoff notes. There is no generic metrics dashboard, AI wrapper, or external service dependency.

## Verified flows

- Production build: `npm run build` creates the client, Node server bundle for Sites packaging, and hosting config.
- Existing Sites checks: `npm run test:sites` passes all four checks.
- Sign-out returns to the sign-in screen; valid credentials reopen the stored workspace and incident.
- Invite links are one-use, bind to an email address, expire after seven days, and allow a new account to join the inviter’s workspace.
- Manually verified invited signup and existing-account acceptance both added responders to the same workspace; each opened the same persisted incident.
- Incident resolution and reopening persist through the API, including resolution timestamps. Resolved incidents show elapsed time and whether recovery evidence was recorded, alongside decision, timeline, and handoff counts. The review states that these signals do not prove customer experience or SLA performance.
- The local clock updates every second, new incidents default to the current local time, replay time is labeled separately, and users can create and switch between incidents without losing prior records.
- Incidents, timeline evidence, decision snapshots, notes, and members are stored server-side in SQLite and scoped to workspace membership.
- Replay can move by scrubber, event, previous/next, and play/pause.
- An observation is recorded with a source and hypothesis links at the current replay point.
- Decisions retain their rationale and the evidence visible at that moment; replay restores the selected point.
- Simulated scenario content is identified as fictional in the interface.

## Boundaries

- Team refresh uses four-second polling, not push updates.
- Evidence, responders in the default scenario, and hypothesis status are simulated; they are not live telemetry or a calibrated diagnostic model.
- The app can run as a single server with SQLite. It is not configured for multi-replica or multi-region operation.
- Public production deployment still needs a host, domain/TLS configuration, email service, verified-email and password-reset flows, monitoring, tested database backups, and an operations/support process.
- The market opportunity and usability outcomes remain hypotheses until responder interviews and usability studies are completed.


