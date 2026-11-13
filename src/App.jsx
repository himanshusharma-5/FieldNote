import { useEffect, useMemo, useState } from "react";

async function apiRequest(path, method = "GET", body) {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Something went wrong. Try again.");
  return result;
}
const SEED_EVENTS = [
  { id: "e1", time: "09:12", title: "Checkout errors rise", body: "Payment authorization failures climb from 0.4% to 18% in ap-south-1. Other regions remain steady.", source: "Checkout SLO · alert", kind: "signal", supports: ["regional", "release"] },
  { id: "e2", time: "09:14", title: "First customer report", body: "Support reports repeated payment retries from customers in Mumbai. Orders are not being duplicated.", source: "Support ticket #4821", kind: "report", supports: ["regional", "release"] },
  { id: "e3", time: "09:17", title: "A release is in the window", body: "Payment-router 3.18.2 reached 20% of ap-south-1 traffic six minutes before the first alert.", source: "Deploy log · rel-771", kind: "change", supports: ["release"] },
  { id: "e4", time: "09:20", title: "Database pool looks healthy", body: "Connection use is 54% of limit and query latency is within its normal range.", source: "Payments DB · metrics", kind: "signal", supports: ["regional"], against: ["database"] },
  { id: "e5", time: "09:24", title: "Errors follow the new route", body: "Failures are concentrated on requests handled by router 3.18.2. The previous version remains near baseline.", source: "Trace sample · 6f9a…", kind: "trace", supports: ["release"], against: ["database", "regional"] },
  { id: "e6", time: "09:28", title: "Rollback begins", body: "Commander approves a staged rollback in ap-south-1 while the team keeps the database hypothesis open.", source: "Decision · 09:28", kind: "decision", supports: ["release"] },
  { id: "e7", time: "09:34", title: "Authorization recovers", body: "Failure rate falls to 2.1% as the old router version returns. Keep watching before closing the incident.", source: "Checkout SLO · alert", kind: "signal", supports: ["release"], against: ["database", "regional"] },
  { id: "e8", time: "09:46", title: "Service back within SLO", body: "Errors stay below 0.7% for twelve minutes. No unusual database or network behavior is observed.", source: "Incident commander · update", kind: "update", supports: ["release"], against: ["database", "regional"] },
];

const HYPOTHESES = [
  { id: "release", name: "Router release introduced a regression", short: "Release regression", owner: "Asha · Payments", summary: "The new router may mishandle authorization requests in this region.", color: "coral" },
  { id: "database", name: "Database connection pressure", short: "Database pressure", owner: "Ravi · Data", summary: "A connection pool limit may be dropping or delaying payment writes.", color: "blue" },
  { id: "regional", name: "Regional network degradation", short: "Regional network", owner: "No owner", summary: "A network path issue may be interrupting traffic to the authorization provider.", color: "gold" },
];

function seedState() {
  return { member: null, incident: null, incidentList: [], events: SEED_EVENTS, decisions: [], notes: [], activeEvent: 0, section: "replay", playing: false, onboarding: false };
}
function timeToMinutes(value) { const [h, m] = value.split(":").map(Number); return h * 60 + m; }
function initials(name = "You") { return name.trim().split(/\s+/).slice(0, 2).map((x) => x[0]).join("").toUpperCase(); }
function localClock(date = new Date(), seconds = false) { return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", ...(seconds ? { second: "2-digit" } : {}), hourCycle: "h23" }).format(date); }
function durationLabel(milliseconds) {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return "Not recorded";
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours) return `${hours} hr ${minutes} min`;
  if (minutes) return `${minutes} min ${seconds} sec`;
  return `${seconds} sec`;
}

function Auth({ onAuth }) {
  const inviteToken = useMemo(() => new URLSearchParams(window.location.search).get("invite") || "", []);
  const [inviteDetails, setInviteDetails] = useState(null);
  const [mode, setMode] = useState(inviteToken ? "signup" : "login"); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!inviteToken) return;
    apiRequest(`/api/invitations/${encodeURIComponent(inviteToken)}`).then(setInviteDetails).catch((err) => setError(err.message));
  }, [inviteToken]);
  async function submit(e) {
    e.preventDefault(); setError(""); setBusy(true);
    const data = new FormData(e.currentTarget);
    const values = Object.fromEntries(data.entries());
    if (mode === "signup" && inviteToken) values.inviteToken = inviteToken;
    if (mode === "signup" && values.password !== values.confirmPassword) { setError("The passwords do not match."); setBusy(false); return; }
    try {
      const result = await apiRequest(mode === "login" ? "/api/auth/login" : "/api/auth/signup", "POST", values);
      await onAuth(result.user, mode === "login" && inviteToken ? { token: inviteToken, details: inviteDetails } : null);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <div className="auth-shell"><div className="auth-aside"><div className="brand"><span className="brand-mark">f</span> fieldnote</div><div className="auth-story"><div className="story-line"><span></span><span></span><span></span><span></span></div><p className="micro-label">THE INCIDENT, AS IT UNFOLDED</p><h2>Good decisions leave a trail.</h2><p>Make sense of what changed, what the team knew, and why the next move made sense.</p></div><div className="aside-foot">A response workspace for moments that matter.</div></div><main className="auth-main"><div className="auth-top"><span>FIELDNOTE / INCIDENT RESPONSE</span><span>PRIVATE WORKSPACE</span></div><form className="auth-form" onSubmit={submit}>{inviteToken ? <><p className="micro-label">TEAM INVITATION</p><h1>{mode === "login" ? `Sign in to join ${inviteDetails?.workspaceName || "your team"}` : `Join ${inviteDetails?.workspaceName || "your team"}`}</h1><p className="auth-copy">{inviteDetails ? mode === "login" ? `Sign in with ${inviteDetails.email} to accept this invitation.` : `Create an account for ${inviteDetails.email} to join this incident workspace.` : "Checking your invitation…"}</p></> : <><p className="micro-label">{mode === "login" ? "WELCOME BACK" : "NEW WORKSPACE"}</p><h1>{mode === "login" ? "Sign in to continue" : "Create your workspace"}</h1><p className="auth-copy">{mode === "login" ? "Pick up the investigation where your team left off." : "Set up an account for your incident response team."}</p></>}{mode === "signup" && <><label>Your name<input name="name" autoComplete="name" required placeholder="e.g. Alex Morgan" /></label><label>Company or team<input name="company" autoComplete="organization" required value={inviteDetails?.workspaceName} readOnly={Boolean(inviteDetails)} placeholder="e.g. Morrow Market" /></label><label>Your role<select name="role" required defaultValue=""><option value="" disabled>Select a role</option><option>Incident commander</option><option>Engineering</option><option>Site reliability</option><option>Operations</option><option>Other</option></select></label></>}<label>Work email<input type="email" name="email" autoComplete="email" required value={inviteDetails?.email} readOnly={Boolean(inviteDetails)} placeholder="you@company.com" /></label><label>Password<input type="password" name="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={mode === "login" ? 1 : 12} maxLength="128" placeholder={mode === "login" ? "Your password" : "At least 12 characters"} /></label>{mode === "signup" && <label>Confirm password<input type="password" name="confirmPassword" autoComplete="new-password" required minLength="12" maxLength="128" placeholder="Enter your password again" /></label>}{error && <p className="error-message" role="alert">{error}</p>}<button className="button primary wide" type="submit" disabled={busy || Boolean(inviteToken && !inviteDetails)}>{busy ? "Please wait…" : mode === "login" ? "Sign in" : inviteToken ? "Join workspace" : "Create account"}<span>↗</span></button><p className="auth-switch">{mode === "login" ? "New to Fieldnote?" : "Already have an account?"} <button type="button" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }}>{mode === "login" ? "Create an account" : "Sign in"}</button></p><p className="auth-note">Your password is stored as a one-way hash. Your session uses a secure, server-managed cookie.</p></form></main></div>;
}

function EvidenceRow({ event, index, current, onSelect }) {
  return <button type="button" className={`event-row ${current ? "selected" : ""}`} onClick={() => onSelect(index)}><span className={`event-dot ${event.kind}`}></span><span className="event-time">{event.time}</span><span className="event-content"><b>{event.title}</b><small>{event.source}</small></span><span className="event-arrow">↗</span></button>;
}

export function App() {
  const invitationToken = useMemo(() => new URLSearchParams(window.location.search).get("invite") || "", []);
  const [state, setState] = useState(seedState);
  const [authReady, setAuthReady] = useState(false);
  const [clock, setClock] = useState(() => new Date());
  const [modal, setModal] = useState(null);
  const [selectedHypothesis, setSelectedHypothesis] = useState("release");
  const [toast, setToast] = useState("");
  const [focusEvent, setFocusEvent] = useState(null);
  const currentIndex = Math.max(0, Math.min(state.activeEvent, state.events.length - 1));
  const currentEvent = state.events[currentIndex];
  const visibleEvents = state.events.slice(0, currentIndex + 1);
  const eventIds = new Set(visibleEvents.map((e) => e.id));
  const incident = state.incident;
  const progression = state.events.length > 1 ? currentIndex / (state.events.length - 1) : 0;
  const currentTime = currentEvent?.time || localClock(clock);
  const liveLocalTime = localClock(clock, true);
  const resolutionMs = incident?.resolvedAt && incident?.created ? Date.parse(incident.resolvedAt) - Date.parse(incident.created) : null;
  const paceFeedback = resolutionMs === null ? null : resolutionMs < 15 * 60_000 ? "Resolved in under 15 minutes" : resolutionMs < 60 * 60_000 ? "Resolved within an hour" : "Resolution took over an hour";
  const recoveryEvent = incident?.events.slice().reverse().find((event) => /recovered|restored|back within/i.test(`${event.title} ${event.body}`));
  const hypotheses = useMemo(() => HYPOTHESES.map((h) => {
    const evidenceFor = visibleEvents.filter((e) => e.supports?.includes(h.id));
    const evidenceAgainst = visibleEvents.filter((e) => e.against?.includes(h.id));
    let status = evidenceFor.length >= 2 && evidenceAgainst.length === 0 ? "Leading" : evidenceAgainst.length >= evidenceFor.length && evidenceAgainst.length > 0 ? "Weakened" : evidenceFor.length || evidenceAgainst.length ? "Still open" : "Open";
    if (h.id === "release" && currentIndex >= 5) status = "Leading";
    if (h.id !== "release" && currentIndex >= 6) status = "Weakened";
    return { ...h, evidenceFor, evidenceAgainst, status };
  }), [currentIndex, state.events]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { user } = await apiRequest("/api/auth/me");
        const { incidents } = await apiRequest("/api/incidents");
        const saved = incidents.length ? (await apiRequest(`/api/incidents/${incidents[0].id}`)).incident : null;
        if (alive) {
          setState({ ...seedState(), member: user, incident: saved, incidentList: incidents, events: saved?.events || SEED_EVENTS, decisions: saved?.decisions || [], notes: saved?.notes || [], activeEvent: 0, onboarding: !saved });
          if (invitationToken) {
            const invitation = await apiRequest(`/api/invitations/${encodeURIComponent(invitationToken)}`);
            if (alive) setModal({ type: "accept-invite", inviteToken: invitationToken, invitation });
          }
        }
      } catch {
        if (alive) setState(seedState());
      } finally { if (alive) setAuthReady(true); }
    })();
    return () => { alive = false; };
  }, []);
  useEffect(() => { const timer = window.setInterval(() => setClock(new Date()), 1000); return () => window.clearInterval(timer); }, []);
  useEffect(() => {
    if (!state.member || !state.incident?.id) return undefined;
    const incidentId = state.incident.id;
    const timer = window.setInterval(async () => {
      try {
        const { incident: latest } = await apiRequest(`/api/incidents/${incidentId}`);
        const { incidents: latestList } = await apiRequest("/api/incidents");
        setState((current) => {
          if (current.incident?.id !== incidentId) return current;
          const changed = current.incident.updated !== latest.updated;
          const membershipChanged = (current.incident.members?.length || 0) !== (latest.members?.length || 0);
          const incidentListChanged = current.incidentList.length !== latestList.length || latestList.some((item) => {
            const existing = current.incidentList.find((candidate) => candidate.id === item.id);
            return !existing || existing.updated_at !== item.updated_at || existing.status !== item.status;
          });
          if (!changed && !membershipChanged && !incidentListChanged) return current;
          const selectedEventId = current.events[current.activeEvent]?.id;
          const nextIndex = Math.max(0, latest.events.findIndex((event) => event.id === selectedEventId));
          return { ...current, incident: latest, incidentList: latestList, events: latest.events, decisions: latest.decisions, notes: latest.notes, activeEvent: nextIndex };
        });
      } catch { /* A later poll retries transient network errors. */ }
    }, 4000);
    return () => window.clearInterval(timer);
  }, [state.member?.id, state.incident?.id]);
  useEffect(() => { if (!state.playing) return undefined; const timer = window.setInterval(() => setState((s) => ({ ...s, activeEvent: Math.min(s.events.length - 1, s.activeEvent + 1), playing: s.activeEvent >= s.events.length - 2 ? false : s.playing })), 1750); return () => window.clearInterval(timer); }, [state.playing, state.events.length]);
  useEffect(() => { if (!toast) return undefined; const t = window.setTimeout(() => setToast(""), 2500); return () => window.clearTimeout(t); }, [toast]);
  useEffect(() => { window.scrollTo(0, 0); }, [state.section, state.member, state.onboarding, state.incident?.created]);

  function patch(values) { setState((s) => ({ ...s, ...values })); }
  function applyIncident(saved, extra = {}) { setState((s) => ({ ...s, ...extra, incident: saved, incidentList: s.incidentList.map((item) => item.id === saved.id ? { ...item, ...saved } : item), events: saved.events, decisions: saved.decisions, notes: saved.notes, activeEvent: Number.isInteger(extra.activeEvent) ? Math.min(extra.activeEvent, Math.max(0, saved.events.length - 1)) : Math.min(s.activeEvent, Math.max(0, saved.events.length - 1)), onboarding: false, section: "replay", playing: false })); }
  async function onAuth(user, pendingInvitation = null) {
    const { incidents } = await apiRequest("/api/incidents");
    const saved = incidents.length ? (await apiRequest(`/api/incidents/${incidents[0].id}`)).incident : null;
    setState({ ...seedState(), member: user, incident: saved, incidentList: incidents, events: saved?.events || SEED_EVENTS, decisions: saved?.decisions || [], notes: saved?.notes || [], activeEvent: 0, onboarding: !saved });
    setModal(pendingInvitation ? { type: "accept-invite", inviteToken: pendingInvitation.token, invitation: pendingInvitation.details } : null);
  }
  async function acceptInvitation(token) {
    try {
      await apiRequest("/api/invitations/accept", "POST", { inviteToken: token });
      const { user } = await apiRequest("/api/auth/me");
      await onAuth(user);
      setToast("You joined the shared workspace");
    } catch (error) { setToast(error.message); }
  }
  async function startIncident(values) {
    try {
      const { incident: saved } = await apiRequest("/api/incidents", "POST", values);
      const { incidents } = await apiRequest("/api/incidents");
      setState((s) => ({ ...s, incident: saved, incidentList: incidents, events: saved.events, decisions: saved.decisions, notes: saved.notes, activeEvent: 0, section: "replay", onboarding: false }));
    } catch (error) { setToast(error.message); }
  }
  async function openIncident(id) {
    try { const { incident: saved } = await apiRequest(`/api/incidents/${id}`); applyIncident(saved); }
    catch (error) { setToast(error.message); }
  }
  async function logDecision(decision) {
    try {
      const { incident: saved } = await apiRequest(`/api/incidents/${incident.id}/decisions`, "POST", { ...decision, eventIndex: currentIndex, time: currentTime, hypothesis: selectedHypothesis, availableEvidence: [...eventIds] });
      applyIncident(saved); setModal(null); setToast(`Decision saved with ${visibleEvents.length} evidence items at ${currentTime}`);
    } catch (error) { setToast(error.message); }
  }
  async function addObservation(observation) {
    try {
      const { incident: saved } = await apiRequest(`/api/incidents/${incident.id}/events`, "POST", { ...observation, time: currentTime, eventIndex: currentIndex });
      applyIncident(saved, { activeEvent: Math.min(currentIndex + 1, saved.events.length - 1) }); setModal(null); setToast("Observation added to the incident record");
    } catch (error) { setToast(error.message); }
  }
  async function addNote(note) {
    try {
      const { incident: saved } = await apiRequest(`/api/incidents/${incident.id}/notes`, "POST", { ...note, time: currentTime });
      applyIncident(saved); setModal(null); setToast("Team note added");
    } catch (error) { setToast(error.message); }
  }
  async function toggleStatus() {
    const status = incident.status === "Resolved" ? "Investigating" : "Resolved";
    try {
      const { incident: saved } = await apiRequest(`/api/incidents/${incident.id}`, "PATCH", { status });
      applyIncident(saved); setToast(status === "Resolved" ? "Incident marked resolved" : "Incident reopened");
    } catch (error) { setToast(error.message); }
  }
  async function inviteTeammate(email) {
    try {
      const { url } = await apiRequest("/api/invitations", "POST", { email });
      setModal({ type: "invite-link", url });
    } catch (error) { setToast(error.message); }
  }
  function replayDecision(item) { patch({ activeEvent: item.eventIndex, section: "replay", playing: false }); setFocusEvent(item.id); setToast(`Replay paused at ${item.time} · ${item.availableEvidence.length} evidence items were available`); }
  async function signOut() {
    try { await apiRequest("/api/auth/logout", "POST", {}); } catch { /* Expired sessions are still cleared from this view. */ }
    setState(seedState()); setModal(null); setFocusEvent(null); setAuthReady(true);
  }

  if (!authReady) return <div className="auth-loading">fieldnote<span>Loading your workspace…</span></div>;
  if (!state.member) return <Auth onAuth={onAuth} />;
  if (state.onboarding || !incident) return <><Setup member={state.member} onStart={startIncident} onSignOut={signOut} hasExisting={Boolean(incident)} onCancel={() => patch({ onboarding: false })} liveLocalTime={liveLocalTime} />{toast && <div className="toast" role="status">{toast}</div>}{modal && <Modal type={modal.type || modal} inviteUrl={modal.url} inviteToken={modal.inviteToken} invitation={modal.invitation} currentTime={currentTime} evidenceCount={visibleEvents.length} hypotheses={HYPOTHESES} selectedHypothesis={selectedHypothesis} member={state.member} onClose={() => setModal(null)} onDecision={logDecision} onObservation={addObservation} onNote={addNote} onInvite={inviteTeammate} onAcceptInvite={acceptInvitation} />}</>;

  return <div className="app-root"><header className="topbar"><div className="brand"><span className="brand-mark">f</span> fieldnote</div><div className="crumb"><span>INCIDENT ROOM</span><i>/</i><b>{incident.title}</b></div><div className="user-menu"><span className="local-clock"><small>LOCAL TIME</small><time dateTime={clock.toISOString()}>{liveLocalTime}</time></span>{state.incidentList.length > 1 && <select aria-label="Switch incident" className="incident-select" value={incident.id} onChange={(e) => openIncident(e.target.value)}>{state.incidentList.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.status}</option>)}</select>}<button type="button" className="quiet-button new-incident-button" onClick={() => patch({ onboarding: true })}>+ New incident</button><span className="live-indicator">{incident.status === "Resolved" ? "Resolved" : "Live response"}</span><span className="avatar">{initials(state.member.name)}</span><button type="button" className="quiet-button" onClick={signOut}>Sign out</button></div></header>
    <main className="room"><section className="incident-head"><div><div className="incident-kicker"><span className="severity">{incident.severity}</span><span>{incident.service} · {incident.region}</span><span>Opened {incident.startedAt} local</span></div><h1>{incident.title}</h1><p>{incident.impact}</p></div><button type="button" className={`button ${incident.status === "Resolved" ? "secondary" : "resolve"}`} onClick={toggleStatus}>{incident.status === "Resolved" ? "Reopen incident" : "Mark resolved"}</button></section>
    {incident.status === "Resolved" && <section className="response-review"><div className="review-heading"><div><p className="micro-label">RESPONSE REVIEW</p><h2>What the incident record shows</h2></div><span className="review-status">{paceFeedback || "Resolution time not recorded"}</span></div><div className="review-metrics"><div><small>TIME TO RESOLVE</small><b>{durationLabel(resolutionMs)}</b></div><div><small>RECOVERY EVIDENCE</small><b>{recoveryEvent ? "Recorded" : "Not recorded"}</b><span>{recoveryEvent?.title || "No recovery signal in the timeline"}</span></div><div><small>DECISIONS RECORDED</small><b>{incident.decisions.length}</b></div><div><small>SOURCED TIMELINE ITEMS</small><b>{incident.events.length}</b></div><div><small>TEAM HANDOFFS</small><b>{incident.notes.length}</b></div></div><p>Pace bands are simple elapsed-time markers, not a quality grade or SLA. Recovery appears only when the record contains a restoration signal; customer experience is not measured. Add a final observation if recovery was confirmed.</p></section>}
    <nav className="room-tabs"><button className={state.section === "replay" ? "active" : ""} onClick={() => patch({ section: "replay" })}>Investigation <span>{state.events.length}</span></button><button className={state.section === "decisions" ? "active" : ""} onClick={() => patch({ section: "decisions" })}>Decision log <span>{state.decisions.length}</span></button><button className={state.section === "coordination" ? "active" : ""} onClick={() => patch({ section: "coordination" })}>Team notes <span>{state.notes.length}</span></button></nav>
    {state.section === "replay" && <><div className="replay-grid"><section className="timeline-panel"><div className="panel-topline"><div><p className="micro-label">INCIDENT PLAYBACK</p><h2>What the team knew</h2></div><span className="counter">{String(currentIndex + 1).padStart(2, "0")} <i>/</i> {String(state.events.length).padStart(2, "0")}</span></div><div className="scrubber-wrap"><div className="scrubber-labels"><span>{state.events[0]?.time}</span><span>{state.events.at(-1)?.time}</span></div><input aria-label="Replay incident timeline" type="range" min="0" max={state.events.length - 1} value={currentIndex} style={{ "--progress": `${progression * 100}%` }} onChange={(e) => patch({ activeEvent: Number(e.target.value), playing: false })} /><div className="timeline-ticks">{state.events.map((e, i) => <button key={e.id} aria-label={`Jump to ${e.time}: ${e.title}`} className={`${i <= currentIndex ? "passed" : ""} ${i === currentIndex ? "now" : ""}`} style={{ left: `${(i / (state.events.length - 1)) * 100}%` }} onClick={() => patch({ activeEvent: i, playing: false })}><span>{e.time}</span></button>)}</div></div><div className="play-controls"><button className="round-control" aria-label="Previous event" disabled={currentIndex === 0} onClick={() => patch({ activeEvent: currentIndex - 1, playing: false })}>‹</button><button className="play-button" onClick={() => { if (currentIndex === state.events.length - 1) patch({ activeEvent: 0, playing: true }); else patch({ playing: !state.playing }); }}>{state.playing ? "Ⅱ  Pause replay" : "▶  Play replay"}</button><button className="round-control" aria-label="Next event" disabled={currentIndex === state.events.length - 1} onClick={() => patch({ activeEvent: currentIndex + 1, playing: false })}>›</button><span className="play-hint">Move through the incident as it unfolded</span></div><div className="evidence-feed"><div className="feed-head"><h3>Incident record</h3><button type="button" className="text-button" onClick={() => setModal("observation")}>+ Add observation</button></div>{state.events.map((event, i) => <EvidenceRow key={event.id} event={event} index={i} current={i === currentIndex} onSelect={(idx) => patch({ activeEvent: idx, playing: false })} />)}</div></section>
      <section className="right-stack"><section className="now-panel"><div className="now-top"><p className="micro-label">REPLAY TIME · {currentTime}</p><span className="now-pulse"></span></div><h2>{currentEvent?.title}</h2><p>{currentEvent?.body}</p><button className="source-link" type="button" onClick={() => setFocusEvent(currentEvent?.id)}>{currentEvent?.source}<span>↗</span></button>{focusEvent === currentEvent?.id && <div className="source-detail"><b>Source provenance</b><span>Captured {currentEvent.time} · added to this replay's evidence snapshot</span></div>}</section>
      <section className="hypothesis-panel"><div className="panel-topline"><div><p className="micro-label">COMPETING EXPLANATIONS</p><h2>What could explain this?</h2></div><button className="icon-text" type="button" aria-label="Add observation" onClick={() => setModal("observation")}>＋</button></div><div className="hypothesis-list">{hypotheses.map((h) => <button key={h.id} className={`hypothesis ${h.color} ${selectedHypothesis === h.id ? "chosen" : ""}`} type="button" onClick={() => { setSelectedHypothesis(h.id); setFocusEvent(null); }}><span className="hypothesis-top"><b>{h.short}</b><em>{h.status}</em></span><span className="hypothesis-summary">{h.summary}</span><span className="hypothesis-bottom"><span>{h.evidenceFor.length} supports · {h.evidenceAgainst.length} challenges</span><span>{h.owner}</span></span></button>)}</div><div className="hypothesis-detail"><div><span className="detail-label">CURRENTLY TESTING</span><b>{hypotheses.find((h) => h.id === selectedHypothesis)?.name}</b></div><p>{hypotheses.find((h) => h.id === selectedHypothesis)?.evidenceFor.length ? `Supported by ${hypotheses.find((h) => h.id === selectedHypothesis)?.evidenceFor.map((e) => e.title.toLowerCase()).join(" · ")}.` : "No supporting evidence yet. Keep it open while new signals arrive."}{hypotheses.find((h) => h.id === selectedHypothesis)?.evidenceAgainst.length ? ` Challenged by ${hypotheses.find((h) => h.id === selectedHypothesis)?.evidenceAgainst.map((e) => e.title.toLowerCase()).join(" · ")}.` : ""}</p></div></section>
      <section className="team-strip"><div className="team-avatars">{(incident.members || []).slice(0, 4).map((person) => <span key={person.id} title={person.name}>{initials(person.name)}</span>)}</div><div className="team-label"><b>{incident.members?.length || 1} {incident.members?.length === 1 ? "responder" : "responders"}</b><small>{(incident.members || []).map((person) => person.name).join(" · ")}</small></div><button className="text-button" onClick={() => patch({ section: "coordination" })}>Team notes ↗</button></section></section></div>
      <section className="decision-bar"><div><p className="micro-label">MAKE THE NEXT MOVE</p><span>Record the action and the evidence behind it.</span></div><button className="button primary" onClick={() => setModal("decision")}>Capture a decision <span>↗</span></button></section></>}
    {state.section === "decisions" && <section className="section-page"><div className="page-heading"><div><p className="micro-label">WHY WE ACTED</p><h2>Decision log</h2><p>Each entry keeps the evidence snapshot from the moment the team chose.</p></div><button className="button primary" onClick={() => { patch({ section: "replay" }); setModal("decision"); }}>Capture a decision <span>↗</span></button></div>{state.decisions.length ? <div className="decision-list">{state.decisions.map((d) => <article className={`decision-row ${focusEvent === d.id ? "highlight" : ""}`} key={d.id}><div className="decision-time"><b>{d.time}</b><span>Replay point {String(d.eventIndex + 1).padStart(2, "0")}</span></div><div className="decision-copy"><p className="micro-label">{d.action}</p><h3>{d.title}</h3><p>{d.rationale}</p><div className="snapshot"><span>Evidence at this moment</span>{d.availableEvidence.map((id) => { const e = state.events.find((x) => x.id === id); return e ? <small key={id}>{e.time} · {e.title}</small> : null; })}</div></div><div className="decision-side"><span>{d.confidence} confidence</span><button className="text-button" onClick={() => replayDecision(d)}>Replay this moment ↗</button></div></article>)}</div> : <div className="empty-panel"><span className="empty-glyph">↳</span><h3>No decisions captured yet</h3><p>Move through the replay, then record a decision to preserve the evidence your team had at that point.</p><button className="button secondary" onClick={() => patch({ section: "replay" })}>Return to replay</button></div>}</section>}
    {state.section === "coordination" && <section className="section-page coordination-page"><div className="page-heading"><div><p className="micro-label">SHARED SITUATION</p><h2>Team notes</h2><p>Short handoffs keep the team aligned without interrupting the investigation.</p></div><div className="page-actions"><button className="button secondary" onClick={() => setModal("invite")}>Invite teammate</button><button className="button primary" onClick={() => setModal("note")}>Add a team note <span>＋</span></button></div></div><div className="coordination-layout"><section className="roster"><h3>On the response</h3>{(incident.members || []).map((person) => <div className="roster-row" key={person.id}><span className="avatar">{initials(person.name)}</span><span><b>{person.name}</b><small>{person.title || "Responder"}</small></span><i>{person.access_role === "owner" ? "Workspace owner" : "Incident responder"}</i></div>)}</section><section className="notes"><h3>Handoff notes</h3>{state.notes.length ? state.notes.map((n) => <article key={n.id} className="note-item"><div><b>{n.author}</b><time>{n.time}</time></div><p>{n.body}</p>{n.hypothesis && <small>Related to: {HYPOTHESES.find((h) => h.id === n.hypothesis)?.short}</small>}</article>) : <div className="empty-notes"><p>No handoff notes yet.</p><span>Add observations that change what the next responder should know.</span></div>}</section></div></section>}
    <footer className="room-foot"><span>FIELDNOTE · SIMULATED INCIDENT</span><span>All people, services and events in this scenario are fictional.</span><button onClick={() => patch({ onboarding: true })}>Create another incident</button></footer>
    {toast && <div className="toast" role="status">{toast}</div>}
    {modal && <Modal type={modal.type || modal} inviteUrl={modal.url} inviteToken={modal.inviteToken} invitation={modal.invitation} currentTime={currentTime} evidenceCount={visibleEvents.length} hypotheses={HYPOTHESES} selectedHypothesis={selectedHypothesis} member={state.member} onClose={() => setModal(null)} onDecision={logDecision} onObservation={addObservation} onNote={addNote} onInvite={inviteTeammate} onAcceptInvite={acceptInvitation} />}
    </main></div>;
}

function Setup({ member, onStart, onSignOut, hasExisting, onCancel, liveLocalTime }) {
  const [form, setForm] = useState(() => ({ title: "Checkout authorization failures", service: "Payments API", severity: "SEV 2 · Major", region: "ap-south-1 · Mumbai", start: localClock(), impact: "18% of Morrow Market checkout attempts in Mumbai are failing at payment authorization. Other regions are unaffected.", recent: "Payment-router 3.18.2 began a 20% regional rollout six minutes before the incident started." }));
  function set(key, value) { setForm((f) => ({ ...f, [key]: value })); }
  return <div className="setup-shell"><header className="topbar"><div className="brand"><span className="brand-mark">f</span> fieldnote</div><div className="user-menu"><span className="local-clock"><small>LOCAL TIME</small><time>{liveLocalTime}</time></span>{hasExisting && <button className="quiet-button" onClick={onCancel}>Back to incident</button>}<span className="avatar">{initials(member.name)}</span><button className="quiet-button" onClick={onSignOut}>Sign out</button></div></header><main className="setup-main"><div className="setup-steps"><span className="step done">01 <i>Account</i></span><b>—</b><span className="step active">02 <i>Incident context</i></span><b>—</b><span className="step">03 <i>Investigation</i></span></div><div className="setup-copy"><p className="micro-label">START WITH THE SITUATION</p><h1>Set the scene before the replay.</h1><p>Give responders a shared starting point. The evidence and timeline will unfold as the incident develops.</p></div><form className="setup-form" onSubmit={(e) => { e.preventDefault(); onStart(form); }}><label>Incident name<input required value={form.title} onChange={(e) => set("title", e.target.value)} /></label><div className="form-two"><label>Affected service<input required value={form.service} onChange={(e) => set("service", e.target.value)} /></label><label>Severity<select value={form.severity} onChange={(e) => set("severity", e.target.value)}><option>SEV 1 · Critical</option><option>SEV 2 · Major</option><option>SEV 3 · Moderate</option><option>SEV 4 · Low</option></select></label></div><div className="form-two"><label>Affected region<input required value={form.region} onChange={(e) => set("region", e.target.value)} /></label><label>Incident start time<input required type="time" value={form.start} onChange={(e) => set("start", e.target.value)} /></label></div><label>Customer impact<textarea required rows="3" value={form.impact} onChange={(e) => set("impact", e.target.value)} /></label><label>Recent change <span className="optional">If known</span><textarea rows="2" value={form.recent} onChange={(e) => set("recent", e.target.value)} /></label><div className="setup-footer"><span>Scenario data is fictional and editable. Times use your local clock.</span><button className="button primary">Create incident <span>↗</span></button></div></form></main></div>;
}

function Modal({ type, inviteUrl, inviteToken, invitation, currentTime, evidenceCount, hypotheses, selectedHypothesis, member, onClose, onDecision, onObservation, onNote, onInvite, onAcceptInvite }) {
  const [error, setError] = useState("");
  function submit(e) { e.preventDefault(); const f = new FormData(e.currentTarget); if (type === "invite") { const email = String(f.get("email") || "").trim(); if (!email) return setError("Enter your teammate’s work email."); onInvite(email); } else if (type === "decision") { const item = { title: String(f.get("title") || "").trim(), action: String(f.get("action") || "").trim(), rationale: String(f.get("rationale") || "").trim(), confidence: String(f.get("confidence") || "Medium") }; if (!item.title || !item.action || !item.rationale) return setError("Complete the action, decision, and rationale."); onDecision(item); } else if (type === "observation") { const title = String(f.get("title") || "").trim(); const body = String(f.get("body") || "").trim(); if (!title || !body) return setError("Add an observation and the source it came from."); onObservation({ title, body, source: String(f.get("source") || "Team observation"), supports: f.get("supports"), against: f.get("against") }); } else { const body = String(f.get("body") || "").trim(); if (!body) return setError("Write a note before saving."); onNote({ body, hypothesis: String(f.get("hypothesis") || "") }); } }
  const isInviteLink = type === "invite-link";
  const isAcceptInvite = type === "accept-invite";
  const heading = isAcceptInvite ? "Join the invited workspace" : isInviteLink ? "Invitation ready" : type === "invite" ? "Invite a teammate" : type === "decision" ? "Capture a decision" : type === "observation" ? "Add an observation" : "Add a team note";
  return <div className="modal-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-head"><div><p className="micro-label">{type === "invite" || isInviteLink ? "WORKSPACE ACCESS" : type === "decision" ? `DECISION AT ${currentTime}` : type === "observation" ? `NEW EVIDENCE · ${currentTime}` : `TEAM HANDOFF · ${currentTime}`}</p><h2 id="modal-title">{heading}</h2></div><button className="modal-close" type="button" aria-label="Close" onClick={onClose}>×</button></div><>{isAcceptInvite ? <div className="modal-form"><p className="auth-copy">Join {invitation?.workspaceName} with your signed-in account ({member.email}). Your incident workspace will switch to this team.</p><div className="modal-actions"><button className="button secondary" type="button" onClick={onClose}>Not now</button><button className="button primary" type="button" onClick={() => onAcceptInvite(inviteToken)}>Join workspace</button></div></div> : isInviteLink ? <div className="modal-form"><p className="auth-copy">This one-time link expires in seven days. Send it directly to your teammate.</p><label>Invitation link<input readOnly value={inviteUrl} onFocus={(e) => e.target.select()} /></label><div className="modal-actions"><button className="button secondary" type="button" onClick={onClose}>Done</button><button className="button primary" type="button" onClick={async () => { try { await navigator.clipboard.writeText(inviteUrl); setError("Link copied to clipboard."); } catch { setError("Select the link above and copy it."); } }}>Copy link</button></div>{error && <p className="error-message" role="status">{error}</p>}</div> : <form className="modal-form" onSubmit={submit}>{type === "invite" ? <><label>Teammate’s work email<input name="email" type="email" required placeholder="name@company.com" autoFocus /></label><p className="snapshot-hint">They can create an account and join {member.company}. The invitation expires in seven days.</p></> : type === "decision" ? <><label>Decision<input name="title" required placeholder="e.g. Roll back router 3.18.2 in Mumbai" /></label><label>Action<select name="action" defaultValue="Mitigation"><option>Mitigation</option><option>Investigation</option><option>Customer communication</option><option>Escalation</option></select></label><label>Why this move now?<textarea name="rationale" required rows="3" placeholder="What evidence supports this move? What remains uncertain?" /></label><label>Confidence<select name="confidence" defaultValue="Medium"><option>High</option><option>Medium</option><option>Low</option></select></label><div className="snapshot-hint">This decision will retain {evidenceCount} evidence items available in the replay.</div></> : type === "observation" ? <><label>What changed?<input name="title" required placeholder="e.g. Rollout cohort has higher failure rate" /></label><label>Observation<textarea name="body" required rows="3" placeholder="Record what you observed and what it may mean." /></label><label>Source<input name="source" placeholder="Trace, alert, teammate, ticket…" /></label><div className="form-two"><label>Supports<select name="supports" defaultValue=""><option value="">No clear support yet</option>{hypotheses.map((h) => <option value={h.id} key={h.id}>{h.short}</option>)}</select></label><label>Challenges<select name="against" defaultValue=""><option value="">No clear challenge</option>{hypotheses.map((h) => <option value={h.id} key={h.id}>{h.short}</option>)}</select></label></div></> : <><label>Note<textarea name="body" required autoFocus rows="4" placeholder="What should the next responder know?" /></label><label>Related explanation<select name="hypothesis" defaultValue={selectedHypothesis}><option value="">No specific explanation</option>{hypotheses.map((h) => <option value={h.id} key={h.id}>{h.short}</option>)}</select></label><span className="modal-by">Added by {member.name} · {currentTime}</span></>}{error && <p className="error-message">{error}</p>}<div className="modal-actions"><button className="button secondary" type="button" onClick={onClose}>Cancel</button><button className="button primary" type="submit">{type === "invite" ? "Create invite link" : type === "decision" ? "Save decision" : type === "observation" ? "Add to timeline" : "Post note"} <span>↗</span></button></div></form>}</></section></div>;
}

export default App;
