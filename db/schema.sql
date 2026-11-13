PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  company TEXT NOT NULL,
  role TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner','responder')),
  joined_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS workspace_invitations (
  token_hash TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  invited_email TEXT NOT NULL COLLATE NOCASE,
  created_by TEXT NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL,
  accepted_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS workspace_invites_lookup ON workspace_invitations(workspace_id, invited_email, expires_at);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS auth_attempts (
  subject TEXT NOT NULL,
  attempted_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_attempts_lookup ON auth_attempts(subject, attempted_at);

CREATE TABLE IF NOT EXISTS incidents (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  service TEXT NOT NULL,
  severity TEXT NOT NULL,
  region TEXT NOT NULL,
  started_at TEXT NOT NULL,
  impact TEXT NOT NULL,
  recent_change TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('Investigating','Resolved')),
  resolved_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS incidents_workspace_updated ON incidents(workspace_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS incident_events (
  id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  clock_time TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  source TEXT NOT NULL,
  kind TEXT NOT NULL,
  supports_json TEXT NOT NULL DEFAULT '[]',
  against_json TEXT NOT NULL DEFAULT '[]',
  added_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  UNIQUE (incident_id, sequence)
);
CREATE INDEX IF NOT EXISTS incident_events_order ON incident_events(incident_id, sequence);

CREATE TABLE IF NOT EXISTS decisions (
  id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  event_index INTEGER NOT NULL,
  clock_time TEXT NOT NULL,
  title TEXT NOT NULL,
  action TEXT NOT NULL,
  rationale TEXT NOT NULL,
  confidence TEXT NOT NULL CHECK (confidence IN ('High','Medium','Low')),
  hypothesis TEXT NOT NULL,
  evidence_ids_json TEXT NOT NULL,
  author_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS decisions_order ON decisions(incident_id, created_at DESC);

CREATE TABLE IF NOT EXISTS team_notes (
  id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  hypothesis TEXT NOT NULL DEFAULT '',
  clock_time TEXT NOT NULL,
  author_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS notes_order ON team_notes(incident_id, created_at DESC);

PRAGMA user_version = 2;
