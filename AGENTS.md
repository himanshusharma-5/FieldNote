# Prototype Instructions

Run the local app yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable project-specific design feedback, preferences, or decisions, record them in this file.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Current product direction from the user (2026-10-25)

- This is a flagship UX portfolio project about immersive incident investigation and decision replay. It combines live coordination, evidence traceability, and competing explanations.
- Keep the product specific to high-pressure software incidents. No generic dashboard, CRUD framing, AI wrapper, or unnecessary external APIs.
- Preserve a conventional sign-in and account-creation entry, and require incident context before opening a new investigation.
- The selected concept is the first visual direction: a restrained, cinematic replay room with a readable central timeline, evidence provenance, hypothesis comparison, and decision snapshots. Keep the interface minimal and legible; avoid visual overload and AI-styled decoration.
- Every visible control must have a working interaction. Use real workspace membership and remove invented people/actions that are not backed by data.
- Make the incident scenario fictional and identify it as simulated. Research findings and market-gap hypotheses must stay clearly distinguished.
- Describe the current stack accurately: server-backed account/workspace flows and SQLite make a complete functional portfolio build, but no customer-facing production deployment exists. Public launch still requires email verification/recovery, hosting/domain, monitoring, and tested backup operations.
- Keep replay time distinct from a live local clock. Start new incidents at the user's current local time by default, but allow correction for incidents entered after the fact.
- Preserve prior incident records when creating another incident. Show per-incident elapsed-time and recovery-evidence feedback with transparent limits; do not invent an SLA score or customer-experience rating.
