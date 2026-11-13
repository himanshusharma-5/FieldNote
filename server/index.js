import { createServer } from "node:http";
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import Database from "better-sqlite3";

const scrypt = promisify(scryptCallback);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const APP_ORIGIN = process.env.APP_ORIGIN || (IS_PRODUCTION ? "" : "http://127.0.0.1:5173");
if (IS_PRODUCTION && !APP_ORIGIN) throw new Error("Set APP_ORIGIN to the public HTTPS origin before starting production.");
const PORT = Number(process.env.API_PORT || process.env.PORT || 8787);
const DB_PATH = path.resolve(process.env.DATABASE_PATH || path.join(ROOT, "data", "fieldnote.sqlite"));
const COOKIE_NAME = IS_PRODUCTION ? "__Host-fieldnote" : "fieldnote_session";
const SESSION_SECONDS = 8 * 60 * 60;
const MAX_BODY = 1024 * 1024;

mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH, { timeout: 5000 });
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 5000");
db.exec(readFileSync(path.join(ROOT, "db", "schema.sql"), "utf8"));
const incidentColumns = new Set(db.pragma("table_info(incidents)").map((column) => column.name));
if (!incidentColumns.has("resolved_at")) {
  db.exec("ALTER TABLE incidents ADD COLUMN resolved_at TEXT");
  db.exec("UPDATE incidents SET resolved_at=updated_at WHERE status='Resolved'");
}

const SCENARIO_EVENTS = [
  ["09:12", "Checkout errors rise", "Payment authorization failures climb from 0.4% to 18% in ap-south-1. Other regions remain steady.", "Checkout SLO · alert", "signal", ["regional", "release"], []],
  ["09:14", "First customer report", "Support reports repeated payment retries from customers in Mumbai. Orders are not being duplicated.", "Support ticket #4821", "report", ["regional", "release"], []],
  ["09:17", "A release is in the window", "Payment-router 3.18.2 reached 20% of ap-south-1 traffic six minutes before the first alert.", "Deploy log · rel-771", "change", ["release"], []],
  ["09:20", "Database pool looks healthy", "Connection use is 54% of limit and query latency is within its normal range.", "Payments DB · metrics", "signal", ["regional"], ["database"]],
  ["09:24", "Errors follow the new route", "Failures are concentrated on requests handled by router 3.18.2. The previous version remains near baseline.", "Trace sample · 6f9a…", "trace", ["release"], ["database", "regional"]],
  ["09:28", "Rollback begins", "Commander approves a staged rollback in ap-south-1 while the team keeps the database hypothesis open.", "Decision · 09:28", "decision", ["release"], []],
  ["09:34", "Authorization recovers", "Failure rate falls to 2.1% as the old router version returns. Keep watching before closing the incident.", "Checkout SLO · alert", "signal", ["release"], ["database", "regional"]],
  ["09:46", "Service back within SLO", "Errors stay below 0.7% for twelve minutes. No unusual database or network behavior is observed.", "Incident commander · update", "update", ["release"], ["database", "regional"]],
];

const statements = {
  userByEmail: db.prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE"),
  userById: db.prepare("SELECT id,email,name,company,role FROM users WHERE id = ?"),
  insertUser: db.prepare("INSERT INTO users (id,email,name,company,role,password_salt,password_hash,created_at) VALUES (?,?,?,?,?,?,?,?)"),
  createWorkspace: db.prepare("INSERT INTO workspaces (id,name,created_at) VALUES (?,?,?)"),
  addMember: db.prepare("INSERT INTO workspace_members (workspace_id,user_id,role,joined_at) VALUES (?,?,?,?)"),
  memberWorkspace: db.prepare("SELECT m.workspace_id,m.role,w.name AS workspace_name FROM workspace_members m JOIN workspaces w ON w.id=m.workspace_id WHERE m.user_id=? ORDER BY m.joined_at DESC LIMIT 1"),
  invite: db.prepare("SELECT i.*,w.name AS workspace_name FROM workspace_invitations i JOIN workspaces w ON w.id=i.workspace_id WHERE i.token_hash=? AND i.expires_at>? AND i.accepted_at IS NULL"),
  insertInvite: db.prepare("INSERT INTO workspace_invitations (token_hash,workspace_id,invited_email,created_by,expires_at,created_at) VALUES (?,?,?,?,?,?)"),
  acceptInvite: db.prepare("UPDATE workspace_invitations SET accepted_at=? WHERE token_hash=? AND accepted_at IS NULL"),
  insertSession: db.prepare("INSERT INTO sessions (token_hash,user_id,workspace_id,expires_at,last_seen_at,created_at) VALUES (?,?,?,?,?,?)"),
  session: db.prepare("SELECT s.*,u.email,u.name,u.company,u.role,w.name AS workspace_name,m.role AS workspace_role FROM sessions s JOIN users u ON u.id=s.user_id JOIN workspaces w ON w.id=s.workspace_id JOIN workspace_members m ON m.workspace_id=s.workspace_id AND m.user_id=s.user_id WHERE s.token_hash=? AND s.expires_at>?"),
  deleteSession: db.prepare("DELETE FROM sessions WHERE token_hash=?"),
  switchSessionWorkspace: db.prepare("UPDATE sessions SET workspace_id=? WHERE token_hash=?"),
  attempts: db.prepare("SELECT COUNT(*) AS count FROM auth_attempts WHERE subject=? AND attempted_at>?"),
  addAttempt: db.prepare("INSERT INTO auth_attempts (subject,attempted_at) VALUES (?,?)"),
  deleteOldAttempts: db.prepare("DELETE FROM auth_attempts WHERE attempted_at<?"),
  insertIncident: db.prepare("INSERT INTO incidents (id,workspace_id,created_by,title,service,severity,region,started_at,impact,recent_change,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)"),
  listIncidents: db.prepare("SELECT id,title,service,severity,region,started_at,status,created_at,updated_at,resolved_at FROM incidents WHERE workspace_id=? ORDER BY updated_at DESC"),
  incident: db.prepare("SELECT * FROM incidents WHERE id=? AND workspace_id=?"),
  updateIncident: db.prepare("UPDATE incidents SET status=?,updated_at=?,resolved_at=? WHERE id=? AND workspace_id=?"),
  events: db.prepare("SELECT e.*,u.name AS author_name FROM incident_events e JOIN users u ON u.id=e.added_by WHERE e.incident_id=? ORDER BY e.sequence"),
  insertEvent: db.prepare("INSERT INTO incident_events (id,incident_id,sequence,clock_time,title,body,source,kind,supports_json,against_json,added_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)"),
  decisions: db.prepare("SELECT d.*,u.name AS author_name FROM decisions d JOIN users u ON u.id=d.author_id WHERE d.incident_id=? ORDER BY d.created_at DESC"),
  insertDecision: db.prepare("INSERT INTO decisions (id,incident_id,event_index,clock_time,title,action,rationale,confidence,hypothesis,evidence_ids_json,author_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)"),
  notes: db.prepare("SELECT n.*,u.name AS author_name FROM team_notes n JOIN users u ON u.id=n.author_id WHERE n.incident_id=? ORDER BY n.created_at DESC"),
  insertNote: db.prepare("INSERT INTO team_notes (id,incident_id,body,hypothesis,clock_time,author_id,created_at) VALUES (?,?,?,?,?,?,?)"),
  members: db.prepare("SELECT u.id,u.name,u.email,u.role AS title,m.role AS access_role FROM workspace_members m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=? ORDER BY m.joined_at"),
};

const createAccount = db.transaction(({ user, workspace, session, now }) => {
  statements.insertUser.run(user.id, user.email, user.name, user.company, user.role, user.salt, user.hash, now.toISOString());
  if (workspace.create) statements.createWorkspace.run(workspace.id, workspace.name, now.toISOString());
  statements.addMember.run(workspace.id, user.id, workspace.role, now.toISOString());
  if (workspace.invitationHash) statements.acceptInvite.run(now.toISOString(), workspace.invitationHash);
  statements.insertSession.run(session.hash, user.id, workspace.id, session.expiresAt, now.getTime(), now.toISOString());
});

function json(res, status, value, extraHeaders = {}) {
  const payload = JSON.stringify(value);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "DENY",
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    ...extraHeaders,
  });
  res.end(payload);
}

function cookieHeader(token, clear = false) {
  const secure = IS_PRODUCTION ? "; Secure" : "";
  const value = clear ? "" : encodeURIComponent(token);
  const age = clear ? "; Max-Age=0" : `; Max-Age=${SESSION_SECONDS}`;
  return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Strict${secure}${age}`;
}

function cookieValue(header, name) {
  const item = header?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  if (!item) return "";
  try { return decodeURIComponent(item.slice(name.length + 1)); } catch { return ""; }
}

function hashToken(token) { return createHash("sha256").update(token).digest("hex"); }
function id() { return randomUUID(); }
function nowIso() { return new Date().toISOString(); }
function minuteTime(value) { const [h, m] = value.split(":").map(Number); return h * 60 + m; }
function normalizedText(value, max = 500) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function badInput(message) { const error = new Error(message); error.status = 400; return error; }

function parseJsonArray(value) {
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}
function toEvent(row) {
  const source = row.kind === "decision" && row.title === "Rollback begins" ? `Decision · ${row.clock_time}` : row.source;
  return { id: row.id, time: row.clock_time, title: row.title, body: row.body, source, kind: row.kind, supports: parseJsonArray(row.supports_json), against: parseJsonArray(row.against_json), author: row.author_name };
}
function toDecision(row) {
  return { id: row.id, eventIndex: row.event_index, time: row.clock_time, title: row.title, action: row.action, rationale: row.rationale, confidence: row.confidence, hypothesis: row.hypothesis, availableEvidence: parseJsonArray(row.evidence_ids_json), author: row.author_name, savedAt: row.created_at };
}
function toNote(row) { return { id: row.id, body: row.body, hypothesis: row.hypothesis, time: row.clock_time, author: row.author_name, createdAt: row.created_at }; }
function toIncident(row) {
  return {
    id: row.id, title: row.title, service: row.service, severity: row.severity, region: row.region,
    startedAt: row.started_at, start: row.started_at, impact: row.impact, recent: row.recent_change,
    status: row.status, created: row.created_at, updated: row.updated_at, resolvedAt: row.resolved_at,
    events: statements.events.all(row.id).map(toEvent),
    decisions: statements.decisions.all(row.id).map(toDecision),
    notes: statements.notes.all(row.id).map(toNote),
    members: statements.members.all(row.workspace_id),
  };
}

function requireSession(req) {
  const token = cookieValue(req.headers.cookie, COOKIE_NAME);
  if (!token || token.length > 200) return null;
  const session = statements.session.get(hashToken(token), Date.now());
  if (!session) return null;
  db.prepare("UPDATE sessions SET last_seen_at=? WHERE token_hash=?").run(Date.now(), hashToken(token));
  return session;
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw Object.assign(new Error("Request body is too large."), { status: 413 });
    chunks.push(chunk);
  }
  if (!size) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw badInput("Send valid JSON."); }
}

function assertSameOrigin(req) {
  const origin = req.headers.origin;
  let matches = false;
  try {
    const requestOrigin = new URL(origin);
    const configuredOrigin = new URL(APP_ORIGIN);
    matches = requestOrigin.origin === configuredOrigin.origin;
    if (!matches && !IS_PRODUCTION && requestOrigin.protocol === "http:" && ["localhost", "127.0.0.1"].includes(requestOrigin.hostname)) matches = true;
  } catch {}
  if (!matches) throw Object.assign(new Error("This request could not be verified."), { status: 403 });
}

function authenticateSession(userId, workspaceId) {
  const token = randomBytes(32).toString("base64url");
  const created = Date.now();
  statements.insertSession.run(hashToken(token), userId, workspaceId, created + SESSION_SECONDS * 1000, created, nowIso());
  return token;
}

async function passwordHash(password, saltHex) {
  return scrypt(password, Buffer.from(saltHex, "hex"), 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}

function tooManyAttempts(subject, limit = 10, windowMs = 15 * 60 * 1000) {
  return statements.attempts.get(subject, Date.now() - windowMs).count >= limit;
}
function recordAttempt(subject) { statements.addAttempt.run(subject, Date.now()); }
function clientAddress(req) { return req.socket.remoteAddress || "unknown"; }

async function api(req, res, url) {
  const route = url.pathname.replace(/\/$/, "") || "/";
  const method = req.method || "GET";
  const writeMethod = ["POST", "PATCH", "PUT", "DELETE"].includes(method);
  if (writeMethod) assertSameOrigin(req);

  if (route === "/api/health" && method === "GET") {
    db.prepare("SELECT 1").get();
    return json(res, 200, { status: "ok", time: nowIso() });
  }

  const invitationRoute = route.match(/^\/api\/invitations\/([a-zA-Z0-9_-]{30,100})$/);
  if (invitationRoute && method === "GET") {
    const invite = statements.invite.get(hashToken(invitationRoute[1]), Date.now());
    if (!invite) return json(res, 404, { error: "This invite link is expired or has already been used." });
    return json(res, 200, { email: invite.invited_email, workspaceName: invite.workspace_name, expiresAt: invite.expires_at });
  }

  if (route === "/api/auth/signup" && method === "POST") {
    const address = clientAddress(req);
    if (tooManyAttempts(`signup:${address}`, 6, 60 * 60 * 1000)) return json(res, 429, { error: "Too many account attempts. Try again later." });
    recordAttempt(`signup:${address}`);
    const input = await readBody(req);
    const name = normalizedText(input.name, 100);
    const email = normalizedText(input.email, 254).toLowerCase();
    const company = normalizedText(input.company, 140);
    const role = normalizedText(input.role, 80);
    const password = typeof input.password === "string" ? input.password : "";
    const invitationToken = typeof input.inviteToken === "string" ? input.inviteToken : "";
    if (!name || !company || !role || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw badInput("Complete each account field with a valid work email.");
    if (password.length < 12 || password.length > 128) throw badInput("Use a password between 12 and 128 characters.");
    if (statements.userByEmail.get(email)) return json(res, 409, { error: "An account already exists for this email. Sign in instead." });
    const inviteHash = invitationToken ? hashToken(invitationToken) : "";
    const invitation = inviteHash ? statements.invite.get(inviteHash, Date.now()) : null;
    if (invitationToken && (!invitation || invitation.invited_email.toLowerCase() !== email)) throw badInput("This invite is invalid, expired, or was sent to a different email.");
    const userId = id();
    const workspaceId = invitation?.workspace_id || id();
    const salt = randomBytes(16).toString("hex");
    const hash = (await passwordHash(password, salt)).toString("hex");
    const token = randomBytes(32).toString("base64url");
    const created = Date.now();
    createAccount({
      user: { id: userId, email, name, company, role, salt, hash },
      workspace: { id: workspaceId, name: invitation?.workspace_name || company, create: !invitation, role: invitation ? "responder" : "owner", invitationHash: inviteHash },
      session: { hash: hashToken(token), expiresAt: created + SESSION_SECONDS * 1000 },
      now: new Date(created),
    });
    const user = statements.userById.get(userId);
    return json(res, 201, { user: { ...user, workspaceId, workspaceName: invitation?.workspace_name || company, workspaceRole: invitation ? "responder" : "owner" } }, { "Set-Cookie": cookieHeader(token) });
  }

  if (route === "/api/auth/login" && method === "POST") {
    const input = await readBody(req);
    const email = normalizedText(input.email, 254).toLowerCase();
    const password = typeof input.password === "string" ? input.password : "";
    const ip = clientAddress(req);
    const ipSubject = `login-ip:${ip}`;
    const emailSubject = `login-email:${email}`;
    if (tooManyAttempts(ipSubject) || tooManyAttempts(emailSubject)) return json(res, 429, { error: "Too many sign-in attempts. Try again in 15 minutes." });
    const profile = statements.userByEmail.get(email);
    let valid = false;
    if (profile && password.length <= 128) {
      const candidate = await passwordHash(password, profile.password_salt);
      const expected = Buffer.from(profile.password_hash, "hex");
      valid = candidate.length === expected.length && timingSafeEqual(candidate, expected);
    } else {
      await passwordHash(password.slice(0, 128), "00112233445566778899aabbccddeeff");
    }
    if (!valid) {
      recordAttempt(ipSubject);
      recordAttempt(emailSubject);
      return json(res, 401, { error: "The email or password is incorrect." });
    }
    db.prepare("DELETE FROM auth_attempts WHERE subject IN (?,?)").run(ipSubject, emailSubject);
    const membership = statements.memberWorkspace.get(profile.id);
    if (!membership) return json(res, 403, { error: "This account is not connected to a workspace." });
    const token = authenticateSession(profile.id, membership.workspace_id);
    const user = statements.userById.get(profile.id);
    return json(res, 200, { user: { ...user, workspaceId: membership.workspace_id, workspaceName: membership.workspace_name, workspaceRole: membership.role } }, { "Set-Cookie": cookieHeader(token) });
  }

  if (route === "/api/auth/logout" && method === "POST") {
    const token = cookieValue(req.headers.cookie, COOKIE_NAME);
    if (token) statements.deleteSession.run(hashToken(token));
    return json(res, 200, { ok: true }, { "Set-Cookie": cookieHeader("", true) });
  }

  if (route === "/api/auth/me" && method === "GET") {
    const session = requireSession(req);
    if (!session) return json(res, 401, { error: "Sign in to continue." });
    return json(res, 200, { user: { id: session.user_id, email: session.email, name: session.name, company: session.company, role: session.role, workspaceId: session.workspace_id, workspaceName: session.workspace_name, workspaceRole: session.workspace_role } });
  }

  const session = requireSession(req);
  if (!session) return json(res, 401, { error: "Your session has expired. Sign in again." });

  if (route === "/api/invitations/accept" && method === "POST") {
    const input = await readBody(req);
    const token = typeof input.inviteToken === "string" ? input.inviteToken : "";
    const inviteHash = token ? hashToken(token) : "";
    const invitation = inviteHash ? statements.invite.get(inviteHash, Date.now()) : null;
    if (!invitation || invitation.invited_email.toLowerCase() !== session.email.toLowerCase()) return json(res, 400, { error: "This invitation is invalid, expired, or belongs to a different email." });
    const sessionToken = cookieValue(req.headers.cookie, COOKIE_NAME);
    const joinWorkspace = db.transaction(() => {
      statements.addMember.run(invitation.workspace_id, session.user_id, "responder", nowIso());
      statements.acceptInvite.run(nowIso(), inviteHash);
      statements.switchSessionWorkspace.run(invitation.workspace_id, hashToken(sessionToken));
    });
    try { joinWorkspace(); } catch (error) { if (error.code === "SQLITE_CONSTRAINT_PRIMARYKEY") return json(res, 409, { error: "You already belong to this workspace." }); throw error; }
    return json(res, 200, { ok: true });
  }

  if (route === "/api/invitations" && method === "POST") {
    const input = await readBody(req);
    const email = normalizedText(input.email, 254).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw badInput("Enter a valid work email.");
    const existing = statements.userByEmail.get(email);
    if (existing && db.prepare("SELECT 1 FROM workspace_members WHERE workspace_id=? AND user_id=?").get(session.workspace_id, existing.id)) return json(res, 409, { error: "This person is already in your workspace." });
    const token = randomBytes(32).toString("base64url");
    const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
    statements.insertInvite.run(hashToken(token), session.workspace_id, email, session.user_id, expiresAt, nowIso());
    return json(res, 201, { url: `${APP_ORIGIN}/?invite=${token}`, email, workspaceName: session.workspace_name, expiresAt });
  }

  if (route === "/api/incidents" && method === "GET") {
    const incidents = statements.listIncidents.all(session.workspace_id).map((row) => ({ ...row, startedAt: row.started_at, resolvedAt: row.resolved_at }));
    return json(res, 200, { incidents });
  }

  if (route === "/api/incidents" && method === "POST") {
    const input = await readBody(req);
    const title = normalizedText(input.title, 180);
    const service = normalizedText(input.service, 120);
    const severity = normalizedText(input.severity, 30);
    const region = normalizedText(input.region, 120);
    const startedAt = /^\d{2}:\d{2}$/.test(input.startedAt || input.start) ? (input.startedAt || input.start) : "09:12";
    const impact = normalizedText(input.impact, 2000);
    const recent = normalizedText(input.recent || input.recentChange, 2000);
    if (!title || !service || !severity || !region || !impact) throw badInput("Complete the required incident fields before starting the investigation.");
    const incidentId = id();
    const now = nowIso();
    const shift = minuteTime(startedAt) - minuteTime("09:12");
    const insert = db.transaction(() => {
      statements.insertIncident.run(incidentId, session.workspace_id, session.user_id, title, service, severity, region, startedAt, impact, recent, "Investigating", now, now);
      SCENARIO_EVENTS.forEach((event, sequence) => {
        const minutes = minuteTime(event[0]) + shift;
        const clock = `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
        const source = event[4] === "decision" ? `Decision · ${clock}` : event[3];
        statements.insertEvent.run(id(), incidentId, sequence, clock, event[1], event[2], source, event[4], JSON.stringify(event[5]), JSON.stringify(event[6]), session.user_id, now);
      });
    });
    insert();
    return json(res, 201, { incident: toIncident(statements.incident.get(incidentId, session.workspace_id)) });
  }

  const match = route.match(/^\/api\/incidents\/([0-9a-f-]+)(?:\/(events|decisions|notes))?$/i);
  if (!match) return json(res, 404, { error: "Not found." });
  const [, incidentId, collection] = match;
  const record = statements.incident.get(incidentId, session.workspace_id);
  if (!record) return json(res, 404, { error: "Incident not found." });

  if (!collection && method === "GET") return json(res, 200, { incident: toIncident(record) });

  if (!collection && method === "PATCH") {
    const input = await readBody(req);
    if (!new Set(["Investigating", "Resolved"]).has(input.status)) throw badInput("Choose a valid incident status.");
    const updatedAt = nowIso();
    statements.updateIncident.run(input.status, updatedAt, input.status === "Resolved" ? updatedAt : null, incidentId, session.workspace_id);
    return json(res, 200, { incident: toIncident(statements.incident.get(incidentId, session.workspace_id)) });
  }

  if (collection === "events" && method === "POST") {
    const input = await readBody(req);
    const title = normalizedText(input.title, 180);
    const body = normalizedText(input.body, 4000);
    const source = normalizedText(input.source || "Team observation", 300);
    const supports = new Set(["release", "database", "regional"]);
    if (!title || !body) throw badInput("Add an observation and what it means.");
    if (input.supports && !supports.has(input.supports) || input.against && !supports.has(input.against)) throw badInput("Choose a valid explanation.");
    const sequence = statements.events.all(incidentId).length;
    const position = Math.min(Math.max(0, Number.isInteger(input.eventIndex) ? input.eventIndex + 1 : sequence), sequence);
    const timestamp = nowIso();
    db.transaction(() => {
      db.prepare("UPDATE incident_events SET sequence=sequence+1000000 WHERE incident_id=? AND sequence>=?").run(incidentId, position);
      db.prepare("UPDATE incident_events SET sequence=sequence-999999 WHERE incident_id=? AND sequence>=?").run(incidentId, position + 1000000);
      statements.insertEvent.run(id(), incidentId, position, normalizedText(input.time, 5) || "09:12", title, body, source, "observation", JSON.stringify(input.supports ? [input.supports] : []), JSON.stringify(input.against ? [input.against] : []), session.user_id, timestamp);
      db.prepare("UPDATE incidents SET updated_at=? WHERE id=?").run(timestamp, incidentId);
    })();
    return json(res, 201, { incident: toIncident(statements.incident.get(incidentId, session.workspace_id)) });
  }

  if (collection === "decisions" && method === "POST") {
    const input = await readBody(req);
    const title = normalizedText(input.title, 180);
    const action = normalizedText(input.action, 80);
    const rationale = normalizedText(input.rationale, 3000);
    const confidence = normalizedText(input.confidence, 10);
    const hypothesis = normalizedText(input.hypothesis, 40);
    const eventRows = statements.events.all(incidentId);
    const eventIndex = Number.isInteger(input.eventIndex) ? Math.min(Math.max(0, input.eventIndex), eventRows.length - 1) : 0;
    const availableIds = eventRows.slice(0, eventIndex + 1).map((e) => e.id);
    if (!title || !action || !rationale || !new Set(["High", "Medium", "Low"]).has(confidence)) throw badInput("Complete the action, decision, rationale, and confidence.");
    const decisionId = id();
    const savedAt = nowIso();
    statements.insertDecision.run(decisionId, incidentId, eventIndex, normalizedText(input.time, 5) || eventRows[eventIndex]?.clock_time || "09:12", title, action, rationale, confidence, hypothesis, JSON.stringify(availableIds), session.user_id, savedAt);
    db.prepare("UPDATE incidents SET updated_at=? WHERE id=?").run(savedAt, incidentId);
    return json(res, 201, { incident: toIncident(statements.incident.get(incidentId, session.workspace_id)) });
  }

  if (collection === "notes" && method === "POST") {
    const input = await readBody(req);
    const body = normalizedText(input.body, 3000);
    const hypothesis = normalizedText(input.hypothesis, 40);
    if (!body) throw badInput("Write a note before saving.");
    const savedAt = nowIso();
    statements.insertNote.run(id(), incidentId, body, hypothesis, normalizedText(input.time, 5) || "09:12", session.user_id, savedAt);
    db.prepare("UPDATE incidents SET updated_at=? WHERE id=?").run(savedAt, incidentId);
    return json(res, 201, { incident: toIncident(statements.incident.get(incidentId, session.workspace_id)) });
  }

  return json(res, 405, { error: "Method not allowed." });
}

const mime = new Map([[".html", "text/html; charset=utf-8"], [".js", "text/javascript; charset=utf-8"], [".css", "text/css; charset=utf-8"], [".svg", "image/svg+xml"], [".png", "image/png"], [".jpg", "image/jpeg"], [".webp", "image/webp"], [".ico", "image/x-icon"], [".json", "application/json; charset=utf-8"]]);
function serveStatic(req, res, pathname) {
  const clientDir = path.join(ROOT, "dist", "client");
  if (!existsSync(clientDir)) return json(res, 503, { error: "Build the app before starting the production server." });
  const requested = pathname === "/" ? "/index.html" : pathname;
  const candidate = path.resolve(clientDir, `.${decodeURIComponent(requested)}`);
  if (!candidate.startsWith(clientDir + path.sep) && candidate !== path.join(clientDir, "index.html")) return json(res, 400, { error: "Invalid path." });
  const file = existsSync(candidate) && statSync(candidate).isFile() ? candidate : path.join(clientDir, "index.html");
  const headers = {
    "Content-Type": mime.get(path.extname(file)) || "application/octet-stream",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "DENY",
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  };
  res.writeHead(200, headers);
  if (req.method === "HEAD") return res.end();
  createReadStream(file).pipe(res);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", APP_ORIGIN);
    if (url.pathname.startsWith("/api/")) return await api(req, res, url);
    if (!["GET", "HEAD"].includes(req.method || "GET")) return json(res, 405, { error: "Method not allowed." });
    return serveStatic(req, res, url.pathname);
  } catch (error) {
    const status = Number.isInteger(error.status) ? error.status : error.code === "SQLITE_CONSTRAINT_UNIQUE" ? 409 : 500;
    if (status >= 500) console.error("request failed", error);
    return json(res, status, { error: status >= 500 ? "Something went wrong. Try again." : error.message });
  }
});

const cleanup = setInterval(() => {
  const now = Date.now();
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(now);
  statements.deleteOldAttempts.run(now - 60 * 60 * 1000);
}, 60 * 60 * 1000);
cleanup.unref();
server.listen(PORT, "0.0.0.0", () => console.log(`Fieldnote server listening on port ${PORT}`));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { server.close(() => { db.close(); process.exit(0); }); });
