// SCP Foundation Terminal
// HTML/CSS/JavaScript conversion of the supplied SwiftUI terminal game.

"use strict";

const API_INDEX_URL = "https://scp-data.tedivm.com/data/scp/items/index.json";
const WIKI_LICENSE_URL = "https://scp-wiki.wikidot.com/licensing-guide";
const CACHE_KEY = "scp-foundation-terminal-index-v1";

const FALLBACK_ITEMS = [
  {
    id: "SCP-4913",
    number: 4913,
    title: "The Hollow Choir",
    objectClass: "EUCLID",
    series: "local",
    rating: 0,
    url: null,
    localBody: [
      "SCP-4913 manifests as a sustained six-voice chord audible only",
      "inside enclosed concrete volumes. Personnel exposed for longer",
      "than 40 seconds begin unconsciously harmonizing and will not",
      "stop until physically removed from the acoustic field.",
      "",
      "Containment is maintained by a continuous 31 Hz counter-tone",
      "generated from the sub-basement resonance array."
    ]
  },
  {
    id: "SCP-7220",
    number: 7220,
    title: "Patient Corridor",
    objectClass: "KETER",
    series: "local",
    rating: 0,
    url: null,
    localBody: [
      "SCP-7220 is a hallway that appends itself to any building with",
      "more than four consecutive right-hand turns. It is patient. It",
      "does not pursue. It waits at the end of a route personnel",
      "already intended to walk.",
      "",
      "Recontainment requires flooding the appended volume with",
      "refrigerant until the corridor declines to remain attached."
    ]
  },
  {
    id: "SCP-2087",
    number: 2087,
    title: "The Inventory",
    objectClass: "THAUMIEL",
    series: "local",
    rating: 0,
    url: null,
    localBody: [
      "SCP-2087 is a ledger that lists every object currently inside",
      "this facility. Items erased from the ledger cease to have been",
      "stored here. Items written into it are found in storage the",
      "following morning, correctly labeled and dusty.",
      "",
      "If SCP-2087 begins writing on its own, the terminal operator's",
      "name will appear in the staffing column. Close the ledger",
      "before the page is finished."
    ]
  }
];

const state = {
  lines: [],
  input: "",
  busy: true,
  phase: "boot",
  operatorName: "UNIDENTIFIED",
  clearance: 0,
  integrity: 100,
  secondsLeft: 0,
  archiveCount: 0,
  online: false,
  credential: "O5-TEMP-4471",
  breachTarget: 3,
  items: FALLBACK_ITEMS.map(x => ({ ...x })),
  opened: new Set(),
  bodyCache: {},
  commandCount: 0,
  current: null,
  sectorLocked: null,
  resolved: 0,
  failures: 0,
  manifestPage: 0
};

const transcript = document.getElementById("transcript");
const input = document.getElementById("commandInput");
const form = document.getElementById("inputForm");
const quickBar = document.getElementById("quickBar");
const prompt = document.getElementById("prompt");
const caret = document.getElementById("caret");
const connectionStatus = document.getElementById("connectionStatus");
const integrity = document.getElementById("integrity");
const timer = document.getElementById("timer");

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function emit(text, kind = "normal") {
  state.lines.push({ text, kind });
  renderLine(state.lines[state.lines.length - 1]);
  scrollBottom();
}

function renderLine(line) {
  const el = document.createElement("div");
  el.className = `line ${line.kind}`;
  el.textContent = line.text || " ";
  transcript.appendChild(el);
}

function clearTranscript() {
  state.lines = [];
  transcript.innerHTML = "";
}

function scrollBottom() {
  transcript.scrollTop = transcript.scrollHeight;
}

async function typeText(text, kind = "normal", cps = 260) {
  const line = { text: "", kind };
  state.lines.push(line);

  const el = document.createElement("div");
  el.className = `line ${kind}`;
  el.textContent = " ";
  transcript.appendChild(el);
  scrollBottom();

  const delay = Math.max(1, 1000 / Math.max(cps, 1));

  for (const ch of text) {
    line.text += ch;
    el.textContent = line.text;
    scrollBottom();
    await sleep(delay);
  }
}

function pause(seconds) {
  return sleep(seconds * 1000);
}

function rule() {
  emit("-".repeat(46), "dim");
}

function setBusy(value) {
  state.busy = value;
  input.disabled = value;
  quickBar.classList.toggle("disabled", value);
  prompt.textContent = value ? "." : ">";
  updateStatus();
}

function updateStatus() {
  connectionStatus.textContent = state.online ? "[SYNCED]" : "[LOCAL]";
  connectionStatus.classList.toggle("offline", !state.online);

  integrity.textContent = `INTEG ${Math.max(state.integrity, 0)}%`;
  integrity.classList.toggle("low", state.integrity <= 60);

  if (state.secondsLeft > 0) {
    timer.textContent = `T-${state.secondsLeft}`;
    timer.classList.remove("hidden");
  } else {
    timer.classList.add("hidden");
  }

  caret.textContent = state.busy ? " " : (caret.classList.contains("blink-off") ? " " : "|");
}

function padded(s, n) {
  s = String(s);
  return s.length >= n ? s + " " : s + " ".repeat(n - s.length);
}

function truncated(s, n) {
  return s.length <= n ? s : s.slice(0, Math.max(0, n - 3)) + "...";
}

function wrapped(text, width) {
  const out = [];
  let line = "";

  for (const word of text.split(/\s+/)) {
    if (!word) continue;

    if (!line) {
      line = word;
    } else if (line.length + word.length + 1 <= width) {
      line += " " + word;
    } else {
      out.push(line);
      line = word;
    }
  }

  if (line) out.push(line);
  return out.length ? out : [""];
}

function sectorFor(number) {
  const letters = ["A", "B", "C", "D", "E", "F", "G", "H"];
  return "SECTOR-" + letters[Math.abs(number) % letters.length];
}

function protoFor(number) {
  const words = [
    "EVENSONG", "COLDSHOULDER", "LASTPAGE", "DRYRIVER", "SALTLINE",
    "GLASSHOUSE", "NIGHTPORTER", "HOLLOWBELL", "FAIRWEATHER",
    "STILLWATER", "LOWTIDE", "PAPERCUT", "SHUTTEREYE", "OPENHAND"
  ];
  return "PROTOCOL-" + words[Math.abs(number * 7 + 3) % words.length];
}

function normalizeItem(item) {
  return {
    id: item.id,
    number: Number(item.number) || 0,
    title: item.title || item.id,
    objectClass: item.objectClass || "UNCLASSED",
    series: item.series || "unknown",
    rating: Number(item.rating) || 0,
    url: item.url || null,
    localBody: item.localBody || null
  };
}

function parseWikiRecord(record, link) {
  const rawLabel = String(record.scp || "").toUpperCase();
  if (!rawLabel.startsWith("SCP-")) return null;

  let number = Number(record.scp_number);
  if (!Number.isFinite(number)) {
    const digits = String(record.scp_number || "").replace(/\D/g, "");
    number = Number(digits);
  }
  if (!Number.isFinite(number)) {
    number = Number(rawLabel.replace(/\D/g, "")) || 0;
  }

  const tags = Array.isArray(record.tags)
    ? record.tags.map(x => String(x).toLowerCase())
    : [];

  const classes = [
    "safe", "euclid", "keter", "thaumiel",
    "apollyon", "archon", "neutralized", "explained",
    "esoteric-class", "pending"
  ];

  const cls = classes.find(x => tags.includes(x));
  const objectClass = cls ? cls.toUpperCase() : "UNCLASSED";

  return normalizeItem({
    id: rawLabel,
    number,
    title: record.title || rawLabel,
    objectClass,
    series: record.series || "unknown",
    rating: record.rating || 0,
    url: record.url || `https://scp-wiki.wikidot.com/${link}`,
    localBody: null
  });
}

async function loadIndex(forceRefresh = false) {
  if (!forceRefresh) {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length) return parsed.map(normalizeItem);
      }
    } catch (_) {}
  }

  const response = await fetch(API_INDEX_URL, {
    cache: forceRefresh ? "no-store" : "default"
  });

  if (!response.ok) throw new Error(`server returned HTTP ${response.status}`);

  const payload = await response.json();
  if (!payload || typeof payload !== "object") throw new Error("archive payload was empty");

  const out = [];

  for (const [link, record] of Object.entries(payload)) {
    if (!record || typeof record !== "object") continue;
    const item = parseWikiRecord(record, link);
    if (item) out.push(item);
  }

  out.sort((a, b) => a.number - b.number);
  if (!out.length) throw new Error("archive payload was empty");

  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(out));
  } catch (_) {}

  return out;
}

function decodeEntities(text) {
  const textarea = document.createElement("textarea");
  textarea.innerHTML = text;
  return textarea.value
    .replace(/\u00a0/g, " ")
    .replace(/—/g, "-")
    .replace(/–/g, "-")
    .replace(/…/g, "...")
    .replace(/×/g, "x");
}

function stripBlocks(s, open, close) {
  let result = s;
  while (true) {
    const a = result.indexOf(open);
    if (a < 0) break;
    const b = result.indexOf(close, a + open.length);
    if (b < 0) break;
    result = result.slice(0, a) + result.slice(b + close.length);
  }
  return result;
}

function extractHTMLText(html) {
  let body = html;
  const start = body.indexOf('<div id="page-content">');
  if (start >= 0) body = body.slice(start + '<div id="page-content">'.length);

  for (const stop of [
    '<div class="footer-wikiwalk-nav"',
    '<div class="licensebox"',
    '<div id="page-info"'
  ]) {
    const end = body.indexOf(stop);
    if (end >= 0) body = body.slice(0, end);
  }

  body = stripBlocks(body, "<script", "</script>");
  body = stripBlocks(body, "<style", "</style>");
  body = stripBlocks(body, '<div class="page-rate-widget-box"', "</div>");

  for (const br of [
    "</p>", "<br>", "<br/>", "<br />", "</div>", "</li>",
    "</h1>", "</h2>", "</h3>", "</tr>", "</blockquote>"
  ]) {
    body = body.split(br).join("\n");
  }

  const holder = document.createElement("div");
  holder.innerHTML = body;
  const text = holder.textContent || "";
  return decodeEntities(text)
    .split("\n")
    .map(x => x.trim())
    .filter(x => x && x !== "rating:");
}

async function loadBody(item, maxLines = 70) {
  if (!item.url) return ["No source URL on file."];

  const response = await fetch(item.url);
  if (!response.ok) throw new Error(`server returned HTTP ${response.status}`);

  const html = await response.text();
  const paragraphs = extractHTMLText(html);
  if (!paragraphs.length) return ["Page fetched but no readable content found."];

  const lines = [];

  for (const p of paragraphs) {
    lines.push(...wrapped(p, 62), "");
    if (lines.length >= maxLines) {
      lines.push("[ ... truncated ... ]");
      break;
    }
  }

  return lines;
}

async function boot() {
  setBusy(true);
  clearTranscript();

  await typeText("SECURE CONNECTION ESTABLISHED", "system", 90);
  await pause(0.25);
  emit("");
  await typeText("###  SCP FOUNDATION  ###", "header", 45);
  await typeText("SITE-88 ADMINISTRATIVE TERMINAL   v5.02", "dim", 200);
  emit("");

  for (const c of [
    "mounting /archive ............ OK",
    "resonance array .............. OK",
    "sector interlocks ............ OK",
    "memetic filter ............... OK"
  ]) {
    await typeText(c, "dim", 340);
    await pause(0.08);
  }

  emit("");
  rule();
  emit("NOTICE: Session credential issued for this terminal.", "warning");
  emit(`        TEMP CREDENTIAL: ${state.credential}`, "warning");
  rule();
  emit("");
  emit(`Authenticate to continue.  Try:  auth ${state.credential}`, "system");
  emit("Type HELP at any time.", "dim");
  emit("");

  state.phase = "login";
  setBusy(false);
  input.focus();
}

function showHelp() {
  rule();
  emit("COMMAND INDEX", "header");

  const rows = [
    ["AUTH <credential>", "sign in to the terminal"],
    ["SYNC [force]", "pull the full wiki archive"],
    ["MANIFEST [page|series]", "browse stored anomalies"],
    ["SEARCH <text>", "search titles and item numbers"],
    ["OPEN <scp-###>", "read a containment file"],
    ["RANDOM", "open an item at random"],
    ["STATUS", "site integrity and active alarms"],
    ["LOCKDOWN <sector>", "seal a sector before recontainment"],
    ["EXECUTE <protocol>", "run a recontainment protocol"],
    ["LICENSE", "data sources and attribution"],
    ["CLEAR / LOGOUT / RESTART", "housekeeping"]
  ];

  for (const [cmd, desc] of rows) emit("  " + padded(cmd, 26) + desc);
  rule();
}

function showLicense() {
  rule();
  emit("DATA SOURCES", "header");
  emit("Manifest metadata: scp-data.tedivm.com (unofficial daily");
  emit("crawl of the SCP Wiki, maintained by @tedivm).");
  emit("Article text: fetched live from scp-wiki.wikidot.com.");
  emit("");
  emit("All wiki content is licensed CC BY-SA 3.0.", "warning");
  emit(WIKI_LICENSE_URL, "dim");
  emit("");
  emit("Sectors, protocols, timers and this terminal are game", "dim");
  emit("fiction added by the app and are not wiki canon.", "dim");
  rule();
}

function showStatus() {
  rule();
  emit(`OPERATOR ...... ${state.operatorName}`);
  emit(`CLEARANCE ..... LEVEL ${state.clearance}`);
  emit(
    `ARCHIVE ....... ${state.items.length} items (${state.online ? "SYNCED" : "LOCAL CACHE"})`,
    state.online ? "success" : "warning"
  );
  emit(
    `INTEGRITY ..... ${Math.max(state.integrity, 0)}%`,
    state.integrity > 60 ? "success" : "alert"
  );
  emit(`CONTAINED ..... ${state.resolved}/${state.breachTarget}`);

  if (state.phase === "breach" && state.current) {
    emit(`ALARM ......... ${state.current.id} LOOSE IN ${sectorFor(state.current.number)}`, "alert");
    emit(
      `LOCKDOWN ...... ${state.sectorLocked || "NONE"}`,
      state.sectorLocked === sectorFor(state.current.number) ? "success" : "warning"
    );
    emit(`TIME LEFT ..... ${state.secondsLeft}s`, "alert");
  } else {
    emit("ALARM ......... none", "dim");
  }

  rule();
}

function showManifest(arg) {
  const pageSize = 14;
  let pool = state.items.slice();
  let label = "ALL ITEMS";
  const trimmed = String(arg || "").trim().toLowerCase();

  if (trimmed && !Number.isFinite(Number(trimmed))) {
    pool = state.items.filter(item =>
      item.series.toLowerCase().includes(trimmed) ||
      item.objectClass.toLowerCase() === trimmed
    );
    label = trimmed.toUpperCase();
    state.manifestPage = 0;
  } else if (trimmed) {
    const page = Number(trimmed);
    state.manifestPage = Math.max(0, page - 1);
  }

  if (!pool.length) {
    emit(`Nothing in the archive matches ${label}.`, "warning");
    return;
  }

  const pages = Math.max(1, Math.ceil(pool.length / pageSize));
  state.manifestPage = Math.min(state.manifestPage, pages - 1);

  const start = state.manifestPage * pageSize;
  const slice = pool.slice(start, start + pageSize);

  rule();
  emit(`${label}  -  page ${state.manifestPage + 1}/${pages}`, "header");

  for (const a of slice) {
    const loose = state.current && a.id === state.current.id;
    const mark = loose ? "!!" : (state.opened.has(a.id) ? " *" : "  ");
    const rowID = padded(a.id, 11);
    const rowClass = padded(a.objectClass, 12);
    const rowTitle = truncated(a.title, 28);
    emit(mark + " " + rowID + rowClass + rowTitle, loose ? "alert" : "normal");
  }

  rule();
  emit(
    `MANIFEST ${state.manifestPage + 2} for the next page. OPEN <scp-###> to read.`,
    "dim"
  );
  state.manifestPage += 1;
}

function searchArchive(arg) {
  const q = String(arg || "").trim().toLowerCase();

  if (q.length < 2) {
    emit("Usage: search <at least two characters>", "warning");
    return;
  }

  const hits = state.items.filter(item =>
    item.title.toLowerCase().includes(q) ||
    item.id.toLowerCase().includes(q)
  );

  if (!hits.length) {
    emit(`No records matching "${arg}".`, "warning");
    return;
  }

  rule();
  emit(`${hits.length} MATCH(ES) - showing up to 14`, "header");

  for (const a of hits.slice(0, 14)) {
    emit("   " + padded(a.id, 11) + padded(a.objectClass, 12) + truncated(a.title, 28));
  }

  rule();
}

function findItem(raw) {
  const key = String(raw || "").toUpperCase().replace(/\s/g, "");
  if (!key) return null;

  const exact = state.items.find(item => item.id === key);
  if (exact) return exact;

  const digits = key.replace(/\D/g, "");
  if (digits && (digits.length === key.length || key.startsWith("SCP-"))) {
    const number = Number(digits);
    return state.items.find(item => item.number === number) || null;
  }

  return null;
}

async function openFile(arg) {
  const a = findItem(arg);

  if (!a) {
    emit(`No such record: ${arg ? String(arg).toUpperCase() : "(empty)"}`, "warning");
    emit("Usage: open scp-173   |   try SEARCH or MANIFEST", "dim");
    return;
  }

  rule();
  await typeText(`ITEM #: ${a.id}  -  "${a.title}"`, "header", 340);
  emit(`OBJECT CLASS: ${a.objectClass}`, "system");
  emit(`SERIES: ${a.series}    RATING: ${a.rating}`, "dim");
  emit(`STORED IN: ${sectorFor(a.number)}`, "system");
  emit("");

  if (Array.isArray(a.localBody)) {
    for (const line of a.localBody) emit(line);
  } else if (state.bodyCache[a.id]) {
    for (const line of state.bodyCache[a.id]) emit(line);
  } else {
    await typeText("retrieving document ...", "dim", 200);

    try {
      const body = await loadBody(a);
      state.bodyCache[a.id] = body;
      for (const line of body) emit(line);
    } catch (error) {
      emit(`DOCUMENT UNAVAILABLE - ${error.message}`, "alert");
      emit("Metadata is intact; the body could not be retrieved.", "dim");
    }
  }

  state.opened.add(a.id);
  emit("");
  emit(
    `RECONTAINMENT: LOCKDOWN ${sectorFor(a.number)}, then EXECUTE ${protoFor(a.number)}`,
    "warning"
  );

  if (a.url) {
    emit(`SOURCE: ${a.url}`, "dim");
    emit("Wiki text (c) its authors, CC BY-SA 3.0.", "dim");
  }

  rule();
}

async function syncArchive(force) {
  emit("");
  await typeText("opening uplink to scp-data.tedivm.com ...", "system", 200);
  emit("This can take a while. The index is large.", "dim");

  try {
    const loaded = await loadIndex(force);
    state.items = loaded;
    state.archiveCount = loaded.length;
    state.online = true;
    state.manifestPage = 0;

    emit("");
    emit("ARCHIVE SYNCHRONIZED.", "success");
    emit(`${loaded.length} item records now resident.`, "normal");

    const keters = loaded.filter(x => x.objectClass === "KETER").length;
    emit(`${keters} of them are classified KETER. Sleep well.`, "dim");
    emit("Wiki text is CC BY-SA 3.0 - type LICENSE for details.", "dim");
    emit("");
    updateStatus();
  } catch (error) {
    state.online = false;
    emit("");
    emit(`UPLINK FAILED - ${error.message}`, "alert");
    emit("Falling back to the three items in local storage.", "dim");
    emit("Check the network and browser permissions.", "dim");
    emit("");
    updateStatus();
  }
}

function requireAuth() {
  if (state.phase === "login" || state.phase === "boot") {
    emit("ACCESS DENIED - no active credential.", "alert");
    emit(`Use:  auth ${state.credential}`, "dim");
    return false;
  }
  return true;
}

async function authenticate(arg) {
  if (state.phase !== "login") {
    emit(`A session is already active for ${state.operatorName}.`, "warning");
    return;
  }

  if (!arg) {
    emit("Usage: auth <credential>", "warning");
    return;
  }

  await typeText("verifying ...", "dim", 140);
  await pause(0.35);

  if (String(arg).toUpperCase() !== state.credential) {
    emit("REJECTED. Credential not on file.", "alert");
    emit("Repeated failures are logged and reviewed.", "dim");
    return;
  }

  state.operatorName = "RESEARCHER BLAKELY";
  state.clearance = 3;
  state.phase = "terminal";

  emit("");
  emit("ACCESS GRANTED - CLEARANCE LEVEL 3", "success");
  rule();
  emit(`Welcome back, ${state.operatorName}.`);
  emit("You are the only operator signed in tonight.", "dim");
  emit("");
  emit(`Local cache holds ${state.items.length} items only.`, "warning");
  emit("Run SYNC to pull the full archive from the wiki.", "system");
  emit("");
}

function flavor(a) {
  const pool = [
    [
      `Motion sensors in ${sectorFor(a.number)} are reporting nothing at all.`,
      "That is worse than reporting something."
    ],
    [
      `The ${sectorFor(a.number)} duty log stopped updating 40 seconds ago.`,
      "Two response officers have not checked back in."
    ],
    [
      `Blast door telemetry from ${sectorFor(a.number)} is contradicting itself.`,
      "Half the sensors insist the chamber is still occupied."
    ],
    [
      `Cameras in ${sectorFor(a.number)} are recording an empty room.`,
      "The empty room is not the room the cameras are in."
    ]
  ];

  return pool[Math.abs(a.number) % pool.length];
}

function pickBreachItem() {
  const dangerous = state.items.filter(item =>
    ["KETER", "EUCLID", "APOLLYON"].includes(item.objectClass) &&
    (!state.current || item.id !== state.current.id)
  );

  const pool = dangerous.length ? dangerous : state.items;
  return pool[Math.floor(Math.random() * pool.length)] || null;
}

async function startBreach() {
  const a = pickBreachItem();
  if (!a) return;

  state.current = a;
  state.sectorLocked = null;
  state.secondsLeft = 90;
  state.phase = "breach";
  updateStatus();

  emit("");
  await typeText("!! CONTAINMENT FAILURE !!", "alert", 60);
  emit("");
  await typeText(`${a.id} - ${a.title} - has left containment.`, "alert", 230);

  for (const f of flavor(a)) {
    await typeText(f, "warning", 290);
    await pause(0.08);
  }

  emit("");
  emit(`You have ${state.secondsLeft} seconds. OPEN the file. Seal the sector.`, "system");
  emit("");
}

async function advanceClock() {
  state.commandCount += 1;

  if (
    state.phase === "terminal" &&
    state.commandCount >= 3 &&
    state.resolved + state.failures < state.breachTarget
  ) {
    await startBreach();
  }
}

function lockdown(arg) {
  const target = String(arg || "").toUpperCase().replace(/\s/g, "");

  if (!target) {
    emit("Usage: lockdown <sector>", "warning");
    return;
  }

  if (state.phase !== "breach" || !state.current) {
    emit("Interlocks refuse: no active breach to seal against.", "warning");
    return;
  }

  const sector = sectorFor(state.current.number);
  const short = sector.replace("SECTOR-", "");

  if (target !== sector && target !== short) {
    emit(`${target} sealed. ${state.current.id} is not in ${target}.`, "warning");
    state.secondsLeft = Math.max(0, state.secondsLeft - 8);
    emit("Blast doors cost you 8 seconds.", "dim");
    updateStatus();
    return;
  }

  state.sectorLocked = sector;
  emit(`${sector} SEALED. Interlocks holding.`, "success");
  emit("Now run the protocol listed in the file.", "dim");
}

async function executeProtocol(arg) {
  const target = String(arg || "").toUpperCase().replace(/\s/g, "");

  if (state.phase !== "breach" || !state.current) {
    emit("No protocol is pending. The site is quiet.", "dim");
    return;
  }

  const sector = sectorFor(state.current.number);
  const proto = protoFor(state.current.number);

  if (state.sectorLocked !== sector) {
    emit(`REFUSED - ${sector} is not under lockdown.`, "alert");
    emit("Protocols will not fire into an open sector.", "dim");
    return;
  }

  if (target !== proto) {
    emit(`${target || "(empty)"} is not valid for ${state.current.id}.`, "alert");
    state.secondsLeft = Math.max(0, state.secondsLeft - 10);
    emit("Misfire. 10 seconds lost.", "dim");
    updateStatus();
    return;
  }

  await typeText(`executing ${proto} ...`, "system", 120);
  await pause(0.5);
  emit("");
  emit(`${state.current.id} RECONTAINED.`, "success");
  emit(`${sector} returned to standard watch.`, "dim");

  state.resolved += 1;
  state.current = null;
  state.sectorLocked = null;
  state.secondsLeft = 0;
  state.phase = "terminal";
  state.commandCount = 0;
  updateStatus();
  emit("");

  if (state.resolved + state.failures >= state.breachTarget) {
    await finish();
  } else {
    emit("Telemetry is still unstable elsewhere on site.", "warning");
    emit("Keep working.", "dim");
  }
}

async function failBreach() {
  if (state.phase !== "breach" || !state.current) return;

  setBusy(true);
  const c = state.current;

  state.integrity -= 34;
  state.failures += 1;

  emit("");
  await typeText(`CONTAINMENT WINDOW CLOSED FOR ${c.id}.`, "alert", 80);
  emit(`Site integrity down to ${Math.max(state.integrity, 0)}%.`, "alert");

  state.current = null;
  state.sectorLocked = null;
  state.phase = "terminal";
  state.commandCount = 0;
  state.secondsLeft = 0;
  updateStatus();

  if (state.integrity <= 0 || state.resolved + state.failures >= state.breachTarget) {
    await finish();
  } else {
    emit("Another alarm is already building. Move faster.", "warning");
    emit("");
  }

  setBusy(false);
}

async function finish() {
  state.phase = "over";
  emit("");
  rule();

  if (state.resolved === state.breachTarget) {
    await typeText("SITE STABLE. ALL ITEMS ACCOUNTED FOR.", "success", 70);
    emit("Your shift ends at 06:00. Nothing happened tonight.", "dim");
    emit("Nothing ever happens tonight.", "dim");
  } else if (state.integrity > 0) {
    await typeText("SHIFT ENDED - PARTIAL CONTAINMENT.", "warning", 70);
    emit(`Recontained ${state.resolved} of ${state.breachTarget}. The rest are loose.`, "dim");
  } else {
    await typeText("SITE LOST.", "alert", 50);
    emit("Someone will write an article about this facility.", "dim");
    emit("It will have a number. It will not have your name.", "dim");
  }

  rule();
  emit("Type RESTART to begin a new session.", "system");
}

function easterEgg(verb, arg) {
  switch (verb) {
    case "whoami":
      return state.phase === "login"
        ? "An unverified body in a chair. Authenticate."
        : `${state.operatorName}, Level ${state.clearance}. Photo on file does not match.`;
    case "sudo":
      return "The Foundation does not have a superuser. It has an O5 Council.";
    case "sing":
      return "Do not sing. Especially not in SECTOR-C.";
    case "tea":
      return "The break room dispenser is anomalous. It is not contained. It is beloved.";
    case "hello":
    case "hi":
      return "The terminal does not answer greetings. It logs them.";
    case "scp":
      return arg ? null : "Try: open scp-173";
    default:
      return null;
  }
}

async function handle(raw) {
  setBusy(true);

  const parts = raw.trim().split(/\s+/);
  const verb = (parts.shift() || "").toLowerCase();
  const arg = parts.join(" ");

  if (!verb) {
    setBusy(false);
    return;
  }

  if (verb === "restart" || verb === "reboot") {
    await reset();
    return;
  }

  if (state.phase === "over") {
    emit("Session is closed. Type RESTART.", "dim");
    setBusy(false);
    return;
  }

  const egg = easterEgg(verb, arg);
  if (egg) {
    emit(egg, "dim");
    setBusy(false);
    return;
  }

  switch (verb) {
    case "help":
    case "?":
    case "commands":
      showHelp();
      break;

    case "license":
    case "credits":
    case "about":
      showLicense();
      break;

    case "clear":
    case "cls":
      clearTranscript();
      emit("Buffer cleared.", "dim");
      break;

    case "auth":
    case "login":
      await authenticate(arg);
      setBusy(false);
      return;

    case "sync":
    case "download":
    case "connect":
      if (!requireAuth()) break;
      await syncArchive(arg.toLowerCase() === "force");
      break;

    case "status":
    case "stat":
      if (!requireAuth()) break;
      showStatus();
      break;

    case "manifest":
    case "list":
    case "ls":
      if (!requireAuth()) break;
      showManifest(arg);
      break;

    case "search":
    case "find":
    case "grep":
      if (!requireAuth()) break;
      searchArchive(arg);
      break;

    case "random":
    case "roll":
      if (!requireAuth()) break;
      await openFile(state.items[Math.floor(Math.random() * state.items.length)]?.id || "");
      break;

    case "open":
    case "file":
    case "read":
    case "query":
      if (!requireAuth()) break;
      await openFile(arg);
      break;

    case "lockdown":
    case "seal":
      if (!requireAuth()) break;
      lockdown(arg);
      break;

    case "execute":
    case "exec":
    case "run":
      if (!requireAuth()) break;
      await executeProtocol(arg);
      break;

    case "logout":
    case "exit":
    case "quit":
      emit("Session terminated by operator. Nothing was contained.", "alert");
      state.phase = "over";
      break;

    default:
      emit(`Unrecognized command: ${verb.toUpperCase()}`, "warning");
      emit("Type HELP for the command index.", "dim");
      break;
  }

  if (state.phase !== "over") {
    await advanceClock();
  }

  setBusy(false);
}

async function submitCommand(command) {
  const raw = String(command || "").trim();
  if (!raw || state.busy) return;

  input.value = "";
  emit(`> ${raw}`, "echo");
  await handle(raw);
  input.focus();
}

async function reset() {
  state.commandCount = 0;
  state.current = null;
  state.sectorLocked = null;
  state.resolved = 0;
  state.failures = 0;
  state.integrity = 100;
  state.secondsLeft = 0;
  state.clearance = 0;
  state.manifestPage = 0;
  state.opened.clear();
  state.bodyCache = {};
  state.operatorName = "UNIDENTIFIED";
  state.online = false;
  state.items = FALLBACK_ITEMS.map(x => ({ ...x }));
  state.phase = "boot";
  updateStatus();
  await boot();
}

form.addEventListener("submit", event => {
  event.preventDefault();
  submitCommand(input.value);
});

quickBar.addEventListener("click", event => {
  const button = event.target.closest("button");
  if (!button || state.busy) return;
  submitCommand(button.dataset.command);
});

setInterval(() => {
  if (state.phase === "breach" && !state.busy && state.secondsLeft > 0) {
    state.secondsLeft -= 1;

    if (state.secondsLeft === 20) {
      emit("20 seconds remaining.", "alert");
    }

    updateStatus();

    if (state.secondsLeft === 0) {
      failBreach();
    }
  }
}, 1000);

setInterval(() => {
  caret.classList.toggle("blink-off");
  updateStatus();
}, 500);

updateStatus();
boot();
