# Fieldnote

Fieldnote is a shared incident response workspace for following a software-service incident as it unfolds, comparing possible explanations, recording decisions with their evidence, and handing context between responders.

## Run locally

Requirements: Node.js 20 or newer and npm.

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:5173`. The development command starts the web app and local API. Data persists in `data/fieldnote.sqlite`. New accounts need a name, team, role, work email, and a password of at least 12 characters. After sign-up, add the incident context before entering the investigation. Existing accounts sign in from the first screen.

The sample Morrow Market payment incident is fictional. The evidence and explanation status are illustrative; they are not connected to a real service or a calibrated diagnosis.

## Production container

The container serves the built app and API from one Node process. Put it behind an HTTPS reverse proxy or managed TLS ingress. Keep `/var/lib/fieldnote` on a persistent disk and take tested backups of the SQLite database and its WAL files. Use one application instance; SQLite is not configured for multi-replica writes.

```sh
docker build -t fieldnote .
docker run --name fieldnote \
  -e NODE_ENV=production \
  -e APP_ORIGIN=https://fieldnote.example.com \
  -e DATABASE_PATH=/var/lib/fieldnote/fieldnote.sqlite \
  -p 8787:8787 \
  -v fieldnote-data:/var/lib/fieldnote \
  fieldnote
```

Set `APP_ORIGIN` to the exact public HTTPS origin (no path). The server requires it in production. Terminate TLS at the trusted ingress and restrict the application port to that ingress. Do not expose the database volume publicly. Keep secrets and environment configuration in the hosting provider’s secret store.

## Account and data behavior

- Passwords are stored as salted scrypt hashes. Sessions use random server-side tokens in HttpOnly, SameSite cookies; production cookies are Secure.
- Workspaces are private. Owners can create seven-day, one-use invitation links. Invitees must use the invited email. New users create an account from the link; existing users sign in and accept the invitation. Incident data, notes, decisions, and evidence are stored in SQLite and scoped to workspace membership.
- The local clock ticks live, new incidents default to the current local time, and replay time is labeled separately. Resolution time is persisted and a resolved incident shows a transparent review of elapsed time, recovery evidence, decisions, timeline items, and handoffs. It does not claim customer satisfaction or SLA compliance. Team updates refresh in active rooms every four seconds. This is polling, not instant push.
- The service has basic login and signup throttles. It does not send email.

## Before public production use

This repository includes a production container and server-backed account/workspace flow, but a public launch still needs an email provider and verified-email/password-reset flows, hosting and domain configuration, automated backup/restore checks, monitoring and alerting, and a documented data-retention/support process. These are external operational dependencies and are not represented as completed. The current SQLite setup supports one app instance rather than high-availability or multi-region operation.

## Build checks

```sh
npm run build
npm run test:sites
```

The Sites worker is a deployment adapter for the portfolio preview; it does not provide the server-backed authentication and collaboration runtime.


