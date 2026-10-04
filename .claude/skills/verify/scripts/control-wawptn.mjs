#!/usr/bin/env node
// control-wawptn — drive a throwaway local WAWPTN instance the way a group of players does.
// Agent-facing: JSON on stdout, one object per invocation, exit 0 on success.
// Run `control-wawptn --help` or `control-wawptn <command> --help`.

import { spawn, execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '..', '..', '..', '..')
const RUN_DIR = path.join(REPO, '.verify-run')
const STATE_FILE = path.join(RUN_DIR, 'state.json')
const EGRESS_LOG = path.join(RUN_DIR, 'egress-blocked.jsonl')
const EVIDENCE_ROOT = process.env.WAWPTN_EVIDENCE_DIR || path.join(REPO, '.verify-evidence')

// The Vite proxy hardcodes localhost:3000, so backend and frontend ports are fixed.
const PORTS = { backend: 3000, frontend: 5173, cdp: 9334, postgres: 55442 }
const PG = 'wawptn-verify-pg'
const LABEL = 'wawptn-verify=1'
const DB_URL = `postgresql://wawptn:wawptn_verify@127.0.0.1:${PORTS.postgres}/wawptn`
const BASE = `http://localhost:${PORTS.frontend}`
const SESSION_COOKIE = 'wawptn.session_token'

// Fake players. Steam ids use a 7656119000000000x range that no real account has.
const USERS = {
  alice: { steamId: '76561190000000001', displayName: 'Alice (fake)' },
  bob: { steamId: '76561190000000002', displayName: 'Bob (fake)' },
  carol: { steamId: '76561190000000003', displayName: 'Carol (fake)' },
}
// Fake games (app ids 9900001+ do not exist on Steam). Owners decide the common set:
// all three players own 1-4, so a 3-player vote offers exactly those four.
const GAMES = [
  { appId: 9900001, name: 'Verify Quest', owners: ['alice', 'bob', 'carol'] },
  { appId: 9900002, name: 'Fake Kart Party', owners: ['alice', 'bob', 'carol'] },
  { appId: 9900003, name: 'Throwaway Tactics', owners: ['alice', 'bob', 'carol'] },
  { appId: 9900004, name: 'Placeholder Raiders', owners: ['alice', 'bob', 'carol'] },
  { appId: 9900005, name: 'Solo Sandbox Sim', owners: ['alice', 'bob'] },
  { appId: 9900006, name: 'Lonely Lighthouse', owners: ['alice'] },
]

// ---------- output ----------
function out(obj) {
  process.stdout.write(JSON.stringify(obj, null, 2) + '\n')
}
class CliError extends Error {
  constructor(message, fix, extra = {}) {
    super(message)
    this.fix = fix
    this.extra = extra
  }
}
function fail(message, fix, extra) {
  throw new CliError(message, fix, extra)
}

// ---------- args ----------
function parseArgs(argv) {
  const pos = []
  const flags = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=')
      if (v !== undefined) flags[k] = v
      else if (argv[i + 1] && !argv[i + 1].startsWith('--')) flags[k] = argv[++i]
      else flags[k] = true
    } else pos.push(a)
  }
  return { pos, flags }
}

// ---------- state ----------
function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
  } catch {
    return null
  }
}
function writeState(s) {
  fs.mkdirSync(RUN_DIR, { recursive: true })
  fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2))
}
function requireState() {
  const s = readState()
  if (!s) fail('No running verification instance.', 'Run `control-wawptn launch` first (or `control-wawptn doctor` to see what is up).')
  return s
}
function evidenceDir(state) {
  // launch records the evidence root, so later calls write to the same place even without the env var.
  const dir = path.join(state?.evidenceRoot || EVIDENCE_ROOT, state?.runId || 'adhoc')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

// ---------- helpers ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
function portInUse(port) {
  return new Promise((resolve) => {
    const s = net.connect({ port, host: '127.0.0.1' })
    s.once('connect', () => { s.destroy(); resolve(true) })
    s.once('error', () => resolve(false))
  })
}
function alive(pid) {
  try { process.kill(pid, 0); return true } catch { return false }
}
function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim()
}
function docker(...args) {
  return sh('docker', args)
}
function containerRunning(name) {
  try { return docker('inspect', '-f', '{{.State.Running}}', name) === 'true' } catch { return false }
}
function psql(sql) {
  return sh('docker', ['exec', '-i', PG, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'wawptn', '-d', 'wawptn', '-At', '-c', sql])
}
function psqlJson(sql) {
  const raw = psql(`select coalesce(json_agg(t), '[]'::json) from (${sql}) t`)
  return JSON.parse(raw || '[]')
}
const q = (s) => `'${String(s).replace(/'/g, "''")}'`
async function waitFor(fn, { timeoutMs, label }) {
  const start = Date.now()
  let last
  while (Date.now() - start < timeoutMs) {
    try { if (await fn()) return Date.now() - start } catch (e) { last = e }
    await sleep(500)
  }
  fail(`Timed out after ${timeoutMs}ms waiting for ${label}.`, `Check the logs in ${path.join(RUN_DIR, 'logs')} and run \`control-wawptn doctor\`.`, { lastError: last?.message })
}
function spawnDetached(name, cmd, args, { cwd, env }) {
  const logDir = path.join(RUN_DIR, 'logs')
  fs.mkdirSync(logDir, { recursive: true })
  const log = fs.openSync(path.join(logDir, `${name}.log`), 'a')
  const child = spawn(cmd, args, { cwd, env, detached: true, stdio: ['ignore', log, log] })
  child.unref()
  return child.pid
}
function loadPlaywright() {
  const req = createRequire(path.join(REPO, 'packages', 'frontend', 'package.json'))
  try { return req('@playwright/test') } catch {
    fail('Cannot load @playwright/test from the repo.', 'Run `npm ci` at the repo root, then `npx playwright install chromium` in packages/frontend.')
  }
}
async function connect() {
  const state = requireState()
  const { chromium } = loadPlaywright()
  let browser
  try {
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORTS.cdp}`)
  } catch (e) {
    fail('Browser daemon is not reachable on the CDP port.', 'Run `control-wawptn doctor`; if the browser is down, run `control-wawptn teardown` then `control-wawptn launch`.', { error: e.message })
  }
  const ctx = browser.contexts()[0]
  const page = ctx.pages()[0] || (await ctx.newPage())
  return { browser, ctx, page, state }
}
function shotPath(state, name) {
  const safe = String(name || 'shot').replace(/[^a-z0-9._-]+/gi, '-')
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  return path.join(evidenceDir(state), `${stamp}_${safe}.png`)
}
function saveJson(state, name, data) {
  const file = shotPath(state, name).replace(/\.png$/, '.json')
  fs.writeFileSync(file, JSON.stringify(data, null, 2))
  return file
}
async function me(page) {
  return page.evaluate(() => fetch('/api/auth/me', { credentials: 'include' }).then((r) => r.json()).catch(() => null))
}
async function closeOverlays(page) {
  // Onboarding / PWA / notification dialogs can sit on top of the page. Escape closes Radix dialogs.
  for (let i = 0; i < 2; i++) {
    if (await page.getByRole('dialog').first().isVisible().catch(() => false)) {
      await page.keyboard.press('Escape').catch(() => {})
      await sleep(300)
    }
  }
}
function resolveGroup(state, flags) {
  const id = flags.group && flags.group !== 'last' ? flags.group : state.lastGroup?.id
  if (!id) fail('No group given and no group recorded in this run.', 'Pass --group <uuid>, or run `control-wawptn group create` first.')
  return id
}

// ---------- fake data ----------
function seedSql() {
  const lines = ['begin;']
  for (const [key, u] of Object.entries(USERS)) {
    lines.push(`insert into users (steam_id, display_name, email, library_visible) values (${q(u.steamId)}, ${q(u.displayName)}, ${q(`${key}@verify.invalid`)}, true);`)
    lines.push(`insert into accounts (user_id, provider_id, account_id) select id, 'steam', steam_id from users where steam_id = ${q(u.steamId)};`)
  }
  for (const g of GAMES) {
    lines.push(`insert into games (canonical_name) values (${q(g.name)});`)
    lines.push(`insert into game_platform_ids (game_id, platform, platform_game_id) select id, 'steam', ${q(String(g.appId))} from games where canonical_name = ${q(g.name)};`)
    // enriched_at + genres set: the backend's background enrichment skips these ids, so it never calls the Steam store.
    lines.push(`insert into game_metadata (steam_app_id, categories, is_multiplayer, is_coop, enriched_at, genres, type, short_description, is_free) values (${g.appId}, '[]', true, true, now(), '["Verification"]', 'game', 'Fake game for local verification.', false);`)
    for (const o of g.owners) {
      lines.push(`insert into user_games (user_id, steam_app_id, game_name, game_id, platform, playtime_forever) select u.id, ${g.appId}, ${q(g.name)}, gm.id, 'steam', 60 from users u, games gm where u.steam_id = ${q(USERS[o].steamId)} and gm.canonical_name = ${q(g.name)};`)
    }
  }
  lines.push('commit;')
  return lines.join('\n')
}

// cookie-parser signed-cookie format (cookie-signature): "s:" + value + "." + base64(HMAC-SHA256) without padding.
function signCookie(value, secret) {
  const mac = crypto.createHmac('sha256', secret).update(value).digest('base64').replace(/=+$/, '')
  return `s:${value}.${mac}`
}

// ---------- commands ----------
const COMMANDS = {}

COMMANDS.launch = {
  summary: 'Start throwaway Postgres, migrate, seed fake players/games, backend, Vite and the browser daemon.',
  help: `control-wawptn launch [--dry-run]

Starts one isolated verification instance:
  - docker container ${PG} (Postgres 16, 127.0.0.1:${PORTS.postgres}, tmpfs, label ${LABEL})
  - knex migrations, then fake data: players ${Object.keys(USERS).join('/')} and ${GAMES.length} fake games
    (all three own 4 of them, so a 3-player vote offers exactly 4 games)
  - backend (tsx, :${PORTS.backend}) preloaded with scripts/no-egress.mjs: every non-localhost
    HTTP call is refused and logged to .verify-run/egress-blocked.jsonl
  - Vite (:${PORTS.frontend}, strictPort) and a headless Chromium daemon (CDP :${PORTS.cdp}) that
    records console + HTTP + WebSocket traffic and answers Steam CDN image requests with a placeholder
STEAM_API_KEY, Discord, Stripe, Resend, LLM, Koe and alert-webhook variables are forced empty.
Refuses to start if any of those ports is taken: one instance at a time.

--dry-run   print the plan and touch nothing.`,
  async run(flags) {
    const plan = {
      ports: PORTS,
      containers: [PG],
      steps: ['docker run postgres:16-alpine (tmpfs)', 'npm run build:types', 'npm run db:migrate', 'seed fake players + games (psql)', 'tsx --import no-egress.mjs src/index.ts', 'vite --port 5173 --strictPort', 'browser daemon'],
      users: USERS,
      games: GAMES.map((g) => g.name),
      evidenceRoot: EVIDENCE_ROOT,
    }
    if (flags['dry-run']) return { ok: true, dryRun: true, plan }
    if (readState()) fail('A verification instance is already recorded in .verify-run/state.json.', 'Run `control-wawptn doctor` to inspect it, or `control-wawptn teardown` before launching again.')
    const busy = []
    for (const [k, p] of Object.entries(PORTS)) if (await portInUse(p)) busy.push(`${k}:${p}`)
    if (busy.length) fail(`Ports already in use: ${busy.join(', ')}.`, 'Another app (or a leaked run) owns them. Do not kill it blindly: check `ss -ltnp`, stop your own leftover with `control-wawptn teardown`, or ask the lead.', { busy })
    try { docker('inspect', PG); fail(`Container ${PG} already exists.`, `Run \`control-wawptn teardown\` (it removes only containers labelled ${LABEL}).`) } catch (e) { if (e instanceof CliError) throw e }

    const runId = new Date().toISOString().replace(/[:.]/g, '-')
    const appSecret = crypto.randomBytes(32).toString('hex')
    const state = { runId, startedAt: new Date().toISOString(), evidenceRoot: EVIDENCE_ROOT, pids: {}, containers: [], appSecret, gitSha: sh('git', ['-C', REPO, 'rev-parse', '--short', 'HEAD']) }
    writeState(state)
    const timings = {}
    let t = Date.now()

    docker('run', '-d', '--name', PG, '--label', LABEL, '-p', `127.0.0.1:${PORTS.postgres}:5432`, '--tmpfs', '/var/lib/postgresql/data',
      '-e', 'POSTGRES_USER=wawptn', '-e', 'POSTGRES_PASSWORD=wawptn_verify', '-e', 'POSTGRES_DB=wawptn', 'postgres:16-alpine')
    state.containers.push(PG); writeState(state)
    await waitFor(() => { psql('select 1'); return true }, { timeoutMs: 60000, label: 'postgres' })
    timings.container = Date.now() - t; t = Date.now()

    const env = {
      ...process.env,
      NODE_ENV: 'development',
      PORT: String(PORTS.backend),
      DATABASE_URL: DB_URL,
      APP_SECRET: appSecret,
      // Production serves API and SPA from one origin; the invite page redirects to `${API_URL}/join/<token>`.
      // Point it at the Vite origin (which proxies /api) so invite links land on the SPA, as in production.
      API_URL: BASE,
      CORS_ORIGIN: BASE,
      APP_PUBLIC_URL: BASE,
      LOG_LEVEL: 'info',
      WAWPTN_EGRESS_LOG: EGRESS_LOG,
      // Never real third parties during verification.
      STEAM_API_KEY: '', EPIC_CLIENT_ID: '', EPIC_CLIENT_SECRET: '', GOG_CLIENT_ID: '', GOG_CLIENT_SECRET: '',
      DISCORD_BOT_API_SECRET: '', DISCORD_BOT_HTTP_URL: '', DISCORD_CLIENT_ID: '', DISCORD_BOT_TOKEN: '',
      LLM_API_KEY: '', STRIPE_SECRET_KEY: '', STRIPE_WEBHOOK_SECRET: '', STRIPE_PRICE_ID: '', STRIPE_PRICE_ID_MONTHLY: '', STRIPE_PRICE_ID_YEARLY: '',
      KOE_IDENTITY_SECRET: '', RESEND_API_KEY: '', ALERT_WEBHOOK_URL: '', ADMIN_STEAM_ID: '',
      VITE_KOE_PROJECT_KEY: '', VITE_KOE_API_URL: '',
    }
    const logDir = path.join(RUN_DIR, 'logs'); fs.mkdirSync(logDir, { recursive: true })
    // Backend and frontend import @wawptn/types from its dist/: build it first.
    for (const [name, args] of [['types', ['run', 'build:types']], ['migrate', ['run', 'db:migrate']]]) {
      try {
        const o = sh('npm', args, { cwd: REPO, env, maxBuffer: 64 << 20 })
        fs.writeFileSync(path.join(logDir, `${name}.log`), o)
      } catch (e) {
        fs.writeFileSync(path.join(logDir, `${name}.log`), `${e.stdout}\n${e.stderr}`)
        fail(`npm ${args.join(' ')} failed.`, `Read ${path.join(logDir, name + '.log')}, fix the cause, then \`control-wawptn teardown\` and launch again.`)
      }
    }
    try { psql(seedSql()) } catch (e) {
      fail('Seeding fake data failed (schema drift?).', 'Compare seedSql() in control-wawptn.mjs with the latest migrations, then teardown and launch again.', { stderr: String(e.stderr || e.message).slice(0, 800) })
    }
    timings.migrateSeed = Date.now() - t; t = Date.now()

    const bin = (n) => path.join(REPO, 'node_modules', '.bin', n)
    state.pids.backend = spawnDetached('backend', bin('tsx'), ['--import', path.join(HERE, 'no-egress.mjs'), 'src/index.ts'], { cwd: path.join(REPO, 'packages', 'backend'), env })
    writeState(state)
    await waitFor(async () => (await fetch(`http://127.0.0.1:${PORTS.backend}/health`)).ok, { timeoutMs: 120000, label: 'backend /health' })
    timings.backend = Date.now() - t; t = Date.now()

    state.pids.frontend = spawnDetached('frontend', bin('vite'), ['--port', String(PORTS.frontend), '--strictPort', '--host', 'localhost'], { cwd: path.join(REPO, 'packages', 'frontend'), env })
    writeState(state)
    await waitFor(async () => (await fetch(BASE)).ok, { timeoutMs: 120000, label: 'vite dev server' })
    timings.frontend = Date.now() - t; t = Date.now()

    state.pids.browser = spawnDetached('browserd', process.execPath, [fileURLToPath(import.meta.url), '__browserd'], { cwd: REPO, env: process.env })
    writeState(state)
    await waitFor(() => portInUse(PORTS.cdp), { timeoutMs: 60000, label: 'browser daemon CDP port' })
    timings.browser = Date.now() - t
    state.readyAt = new Date().toISOString()
    writeState(state)
    return { ok: true, runId, base: BASE, pids: state.pids, containers: state.containers, users: Object.keys(USERS), timingsMs: timings, evidenceDir: evidenceDir(state), next: 'control-wawptn doctor' }
  },
}

COMMANDS.doctor = {
  summary: 'Read-only health check: is this instance ours, up, seeded and drivable?',
  help: `control-wawptn doctor

Read-only. Checks: state file, recorded pids alive, container running, backend /health (db),
Vite answering, browser daemon CDP port, Playwright Chromium installed, fake players and the
4 common fake games present, outbound calls refused so far (egressBlocked, informational),
git sha of the checkout. Exit 0 only when every check passes. Run it first whenever anything looks off.`,
  async run() {
    const state = readState()
    const checks = {}
    checks.stateFile = !!state
    checks.pids = Object.fromEntries(Object.entries(state?.pids || {}).map(([k, p]) => [k, alive(p)]))
    checks.container = containerRunning(PG)
    try { const r = await fetch(`http://127.0.0.1:${PORTS.backend}/health`); checks.backendHealth = r.ok ? await r.json() : r.status } catch { checks.backendHealth = false }
    try { checks.frontend = (await fetch(BASE)).ok } catch { checks.frontend = false }
    checks.browserCdp = await portInUse(PORTS.cdp)
    try { const { chromium } = loadPlaywright(); checks.playwrightChromium = fs.existsSync(chromium.executablePath()) } catch { checks.playwrightChromium = false }
    if (checks.container) {
      try {
        checks.fakeUsers = Number(psql(`select count(*) from users where steam_id like '765611900000000%'`)) === Object.keys(USERS).length
        checks.commonFakeGames = Number(psql(`select count(*) from (select game_id from user_games where steam_app_id >= 9900001 group by game_id having count(distinct user_id) = 3) t`)) === 4
      } catch (e) { checks.db = e.message }
    }
    checks.egressBlocked = fs.existsSync(EGRESS_LOG) ? fs.readFileSync(EGRESS_LOG, 'utf8').split('\n').filter(Boolean).length : 0
    checks.gitSha = sh('git', ['-C', REPO, 'rev-parse', '--short', 'HEAD'])
    const ok = !!state && Object.values(checks.pids).every(Boolean) && checks.container && checks.backendHealth?.status === 'ok'
      && checks.frontend && checks.browserCdp && checks.playwrightChromium && checks.fakeUsers && checks.commonFakeGames
    const hints = []
    if (!state) hints.push('No instance recorded: run `control-wawptn launch`.')
    if (state && !Object.values(checks.pids).every(Boolean)) hints.push('A recorded process died: read .verify-run/logs/*.log, then `control-wawptn teardown` and launch again.')
    if (!checks.playwrightChromium) hints.push('Run `npx playwright install chromium` in packages/frontend.')
    if (checks.egressBlocked) hints.push(`The backend tried ${checks.egressBlocked} outbound call(s); they were refused. See .verify-run/egress-blocked.jsonl (expected: Steam library sync when a page asks for it).`)
    if (!ok) process.exitCode = 1
    return { ok: !!ok, runId: state?.runId, checks, hints }
  },
}

COMMANDS.teardown = {
  summary: 'Stop what launch started (by recorded pid / labelled container); keep evidence.',
  help: `control-wawptn teardown [--dry-run]

Kills the process groups recorded in .verify-run/state.json (never by name), removes the
${PG} container only if it carries label ${LABEL}, deletes .verify-run/. Before deleting,
copies logs, console/network JSONL and the egress log into the evidence dir.
Evidence under ${EVIDENCE_ROOT} is never deleted.

--dry-run   list what would be stopped/removed and do nothing.`,
  async run(flags) {
    const state = readState()
    const plan = { kill: state?.pids || {}, containers: [], remove: [RUN_DIR].filter((p) => fs.existsSync(p)), keep: EVIDENCE_ROOT }
    try { if (docker('inspect', '-f', '{{index .Config.Labels "wawptn-verify"}}', PG) === '1') plan.containers.push(PG) } catch {}
    if (flags['dry-run']) return { ok: true, dryRun: true, plan }
    let saved = null
    if (state && fs.existsSync(RUN_DIR)) {
      saved = path.join(evidenceDir(state), 'run-logs')
      fs.mkdirSync(saved, { recursive: true })
      for (const f of ['console.jsonl', 'network.jsonl', 'egress-blocked.jsonl']) if (fs.existsSync(path.join(RUN_DIR, f))) fs.copyFileSync(path.join(RUN_DIR, f), path.join(saved, f))
      if (fs.existsSync(path.join(RUN_DIR, 'logs'))) fs.cpSync(path.join(RUN_DIR, 'logs'), path.join(saved, 'logs'), { recursive: true })
    }
    const killed = {}
    for (const [name, pid] of Object.entries(state?.pids || {})) {
      try { process.kill(-pid, 'SIGTERM'); killed[name] = 'SIGTERM' } catch { killed[name] = 'not running' }
    }
    await sleep(1500)
    for (const [name, pid] of Object.entries(state?.pids || {})) {
      if (alive(pid)) { try { process.kill(-pid, 'SIGKILL'); killed[name] = 'SIGKILL' } catch {} }
    }
    for (const c of plan.containers) docker('rm', '-f', c)
    fs.rmSync(RUN_DIR, { recursive: true, force: true })
    const portsStillOpen = []
    for (const [k, p] of Object.entries(PORTS)) if (await portInUse(p)) portsStillOpen.push(`${k}:${p}`)
    return { ok: portsStillOpen.length === 0, killed, removedContainers: plan.containers, savedLogs: saved, evidenceKept: state ? evidenceDir(state) : EVIDENCE_ROOT, portsStillOpen }
  },
}

COMMANDS.info = {
  summary: 'Print the recorded run (ids, pids, urls, current player, last group, evidence dir).',
  help: 'control-wawptn info\n\nRead-only: prints .verify-run/state.json (minus the throwaway APP_SECRET), the fake players and the evidence dir.',
  async run() {
    const { appSecret, ...s } = requireState()
    return { ok: true, ...s, base: BASE, users: USERS, games: GAMES, evidenceDir: evidenceDir(s) }
  },
}

COMMANDS.login = {
  summary: 'Become a fake player (alice|bob|carol): mint a session the way the Steam callback does, set the signed cookie.',
  help: `control-wawptn login --as alice|bob|carol [--dry-run]

Steam OpenID is the only sign-in method and it needs steamcommunity.com, so the harness
stops at that boundary: it inserts a sessions row for the fake player (the same row
createUserSession() writes after a successful Steam callback), signs the token with this
run's APP_SECRET and sets the httpOnly cookie ${SESSION_COOKIE} in the shared browser.
Every other cookie is cleared first, so this also switches player. It then opens / and
checks GET /api/auth/me names the player. The "Se connecter avec Steam" button itself is
NOT covered by this harness.
--dry-run   print the player and what would be written.`,
  async run(flags) {
    const key = flags.as || 'alice'
    const who = USERS[key]
    if (!who) fail(`Unknown player "${key}".`, `Use --as ${Object.keys(USERS).join('|')}.`)
    if (flags['dry-run']) return { ok: true, dryRun: true, player: key, steamId: who.steamId, writes: 'one sessions row', cookie: SESSION_COOKIE }
    const state = requireState()
    const token = crypto.randomBytes(32).toString('hex')
    psql(`insert into sessions (user_id, token, expires_at) select id, ${q(token)}, now() + interval '7 days' from users where steam_id = ${q(who.steamId)}`)
    const { browser, ctx, page } = await connect()
    try {
      await ctx.clearCookies()
      await ctx.addCookies([{ name: SESSION_COOKIE, value: encodeURIComponent(signCookie(token, state.appSecret)), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax', expires: Math.floor(Date.now() / 1000) + 7 * 86400 }])
      await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
      const user = await me(page)
      if (user?.displayName !== who.displayName) fail('The session cookie was not accepted.', 'Check `control-wawptn network-log --filter /api/auth/me` and .verify-run/logs/backend.log; APP_SECRET in state.json must match the backend.', { me: user })
      state.currentPlayer = key; writeState(state)
      return { ok: true, player: key, me: { id: user.id, displayName: user.displayName }, url: page.url() }
    } finally {
      await browser.close()
    }
  },
}

COMMANDS.goto = {
  summary: 'Navigate the shared page to a path (e.g. /groups/<id>).',
  help: 'control-wawptn goto <path>\n\nNavigates and waits for network idle. Example: control-wawptn goto /profile',
  async run(_f, pos) {
    if (!pos[0]) fail('Missing path.', 'Example: control-wawptn goto /library')
    const { browser, page } = await connect()
    const r = await page.goto(BASE + (pos[0].startsWith('/') ? pos[0] : '/' + pos[0]), { waitUntil: 'networkidle' }).catch(() => null)
    const res = { ok: true, url: page.url(), status: r?.status(), title: await page.title() }
    await browser.close()
    return res
  },
}

COMMANDS.screenshot = {
  summary: 'Save a PNG of the current page into the evidence dir.',
  help: 'control-wawptn screenshot [--name <label>] [--full-page]\n\nWrites <evidence>/<timestamp>_<label>.png and prints its path.',
  async run(flags) {
    const { browser, page, state } = await connect()
    const file = shotPath(state, flags.name)
    await page.screenshot({ path: file, fullPage: !!flags['full-page'] })
    const url = page.url()
    await browser.close()
    return { ok: true, file, url }
  },
}

COMMANDS.snapshot = {
  summary: 'ARIA snapshot of the current page (what a screen reader / agent sees).',
  help: 'control-wawptn snapshot [--name <label>] [--selector <css>]\n\nPrints the ARIA tree (YAML) of body or --selector, and saves it as <evidence>/<ts>_<label>.aria.yml.',
  async run(flags) {
    const { browser, page, state } = await connect()
    const yml = await page.locator(flags.selector || 'body').ariaSnapshot()
    const file = shotPath(state, flags.name || 'snapshot').replace(/\.png$/, '.aria.yml')
    fs.writeFileSync(file, yml)
    const url = page.url()
    await browser.close()
    return { ok: true, url, file, aria: yml }
  },
}

COMMANDS.click = {
  summary: 'Click by role+name (preferred), label, or text.',
  help: 'control-wawptn click (--role <role> --name <regex> | --text <regex> | --label <regex>) [--dry-run]\n\nExample: control-wawptn click --role button --name "^Lancer le vote$"',
  async run(flags) {
    const { browser, page } = await connect()
    const loc = flags.role ? page.getByRole(flags.role, { name: new RegExp(flags.name || '.', 'i') })
      : flags.label ? page.getByLabel(new RegExp(flags.label, 'i'))
      : flags.text ? page.getByText(new RegExp(flags.text, 'i')) : null
    if (!loc) { await browser.close(); fail('No locator given.', 'Pass --role button --name "Créer" (preferred), --label or --text.') }
    const count = await loc.count()
    if (count === 0) { await browser.close(); fail('Locator matched nothing.', 'Run `control-wawptn snapshot` and copy the role/name from the ARIA tree.') }
    if (flags['dry-run']) { await browser.close(); return { ok: true, dryRun: true, matches: count } }
    await loc.first().click()
    await sleep(500)
    const url = page.url()
    await browser.close()
    return { ok: true, matches: count, url }
  },
}

COMMANDS.key = {
  summary: 'Press a key on the focused element (Enter, Escape, Tab...).',
  help: 'control-wawptn key <Key>\n\nExample: control-wawptn key Escape',
  async run(_f, pos) {
    if (!pos[0]) fail('Missing key.', 'Example: control-wawptn key Enter')
    const { browser, page } = await connect()
    await page.keyboard.press(pos[0])
    await browser.close()
    return { ok: true, key: pos[0] }
  },
}

// ---------- group session ----------
function currentPlayer(state) {
  if (!state.currentPlayer) fail('No player is logged in.', 'Run `control-wawptn login --as alice` first.')
  return { key: state.currentPlayer, ...USERS[state.currentPlayer] }
}
function membersOf(groupId) {
  return psqlJson(`select u.display_name as "displayName", gm.role from group_members gm join users u on u.id = gm.user_id where gm.group_id = ${q(groupId)} order by gm.joined_at`)
}

COMMANDS.group = {
  summary: 'Group lifecycle through the UI: group create | group join | group show.',
  help: `control-wawptn group create [--name <name>] [--dry-run]
control-wawptn group join [--invite <url>] [--dry-run]
control-wawptn group show [--group <uuid>]

create  As the logged-in player: on / click "Créer", fill "Nom du groupe" (default "Soirée verify"),
        click "Créer" in the dialog, capture POST /api/groups, read the invite link shown in the
        "Invite tes amis dès maintenant" dialog, screenshot it, then click "Aller au groupe".
        Records the group id and invite link as the run's last group.
        Side effect: one groups row + an owner group_members row.
join    As the logged-in player: open the invite link (default: the last group's) like a friend
        clicking it. The backend /invite/<token> page redirects to /join/<token>, which posts
        /api/groups/join. Passes only if the page lands on /groups/<id> and the group_members row
        exists. Every /api/groups/join response is reported (see features/group-invite.md).
        Side effect: one group_members row, invite_use_count + 1.
show    Read-only: the group row and its members from the DB.
--dry-run   create/join: print the steps without touching the browser.`,
  async run(flags, pos) {
    const sub = pos[0]
    const state = requireState()
    if (sub === 'show') {
      const id = resolveGroup(state, flags)
      return { ok: true, group: psqlJson(`select id, name, invite_use_count as "inviteUseCount", invite_max_uses as "inviteMaxUses" from groups where id = ${q(id)}`)[0] || null, members: membersOf(id) }
    }
    if (sub === 'create') {
      const name = typeof flags.name === 'string' ? flags.name : 'Soirée verify'
      if (flags['dry-run']) return { ok: true, dryRun: true, steps: ['goto /', 'click "Créer"', `fill "Nom du groupe" = ${name}`, 'click "Créer" (dialog)', 'read invite link from dialog', 'click "Aller au groupe"'] }
      const player = currentPlayer(state)
      const { browser, page } = await connect()
      try {
        await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
        await page.getByRole('button', { name: /^Créer$/ }).first().click()
        const dialog = page.getByRole('dialog')
        await dialog.getByLabel(/Nom du groupe/).fill(name)
        const respP = page.waitForResponse((r) => r.url().endsWith('/api/groups') && r.request().method() === 'POST', { timeout: 15000 })
        await dialog.getByRole('button', { name: /^Créer$/ }).click()
        const resp = await respP
        const body = await resp.json().catch(() => null)
        if (resp.status() !== 201) fail(`POST /api/groups answered ${resp.status()}.`, 'Read the body and .verify-run/logs/backend.log (free tier allows 2 owned groups per player).', { body })
        const invite = (await dialog.locator('code').first().textContent({ timeout: 10000 }).catch(() => ''))?.trim()
        const file = shotPath(state, 'group-created-invite')
        await page.screenshot({ path: file })
        await dialog.getByRole('button', { name: /^Aller au groupe$/ }).click()
        await page.waitForURL(/\/groups\/[0-9a-f-]{36}$/, { timeout: 10000 }).catch(() => {})
        const members = membersOf(body.id)
        state.lastGroup = { id: body.id, name: body.name, invite, owner: player.key }
        writeState(state)
        const ok = !!invite && invite.includes(body.inviteToken) && members.length === 1 && members[0].role === 'owner'
        if (!ok) process.exitCode = 1
        const result = { ok, player: player.key, response: { status: resp.status(), id: body.id, name: body.name }, inviteShown: invite, members, url: page.url(), file }
        saveJson(state, 'group-created', result)
        return result
      } finally {
        await browser.close()
      }
    }
    if (sub === 'join') {
      const invite = typeof flags.invite === 'string' ? flags.invite : state.lastGroup?.invite
      if (!invite) fail('No invite link.', 'Run `control-wawptn group create` first, or pass --invite <url>.')
      if (flags['dry-run']) return { ok: true, dryRun: true, invite, steps: ['goto invite link', 'backend page redirects to /join/<token>', 'wait for /groups/<id>', 'read group_members'] }
      const player = currentPlayer(state)
      const { browser, page } = await connect()
      try {
        const joins = []
        const onResp = async (r) => {
          if (r.url().includes('/api/groups/join')) joins.push({ status: r.status(), body: await r.json().catch(() => null) })
        }
        page.on('response', onResp)
        await page.goto(invite, { waitUntil: 'networkidle' })
        await page.waitForURL(/\/groups\/[0-9a-f-]{36}$/, { timeout: 10000 }).catch(() => {})
        await sleep(1000)
        page.off('response', onResp)
        const file = shotPath(state, `group-joined-${player.key}`)
        await page.screenshot({ path: file })
        const groupId = joins.find((j) => j.body?.id)?.body.id || state.lastGroup?.id
        const members = membersOf(groupId)
        const isMember = members.some((m) => m.displayName === player.displayName)
        const landed = /\/groups\/[0-9a-f-]{36}$/.test(new URL(page.url()).pathname)
        const errorShown = await page.getByRole('heading', { name: /Impossible de rejoindre/ }).isVisible().catch(() => false)
        const ok = isMember && landed && !errorShown
        if (!ok) process.exitCode = 1
        const result = { ok, player: player.key, joinResponses: joins.map((j) => ({ status: j.status, alreadyMember: j.body?.alreadyMember, error: j.body?.error })), landedOnGroup: landed, errorShown, members, url: page.url(), file,
          ...(ok ? {} : { fix: errorShown && isMember ? 'The membership row exists but the UI shows "Impossible de rejoindre": see the join race in features/group-invite.md (Gotchas).' : 'Check `control-wawptn network-log --filter /api/groups/join` and .verify-run/logs/backend.log.' }) }
        saveJson(state, `group-joined-${player.key}`, result)
        return result
      } finally {
        await browser.close()
      }
    }
    fail(`Unknown group subcommand "${sub ?? ''}".`, 'Use `group create`, `group join` or `group show` (see `control-wawptn group --help`).')
  },
}

function sessionRow(groupId) {
  return psqlJson(`select id, status, winning_game_name as "winner", created_at as "createdAt", closed_at as "closedAt" from voting_sessions where group_id = ${q(groupId)} order by created_at desc limit 1`)[0] || null
}
function ballot(sessionId, steamId) {
  return psqlJson(`select v.steam_app_id as "appId", g.game_name as "game", v.vote from votes v join users u on u.id = v.user_id join voting_session_games g on g.session_id = v.session_id and g.steam_app_id = v.steam_app_id where v.session_id = ${q(sessionId)} and u.steam_id = ${q(steamId)} order by g.game_name`)
}

COMMANDS.vote = {
  summary: 'Voting session through the UI: vote start | vote cast | vote close | vote show.',
  help: `control-wawptn vote start [--group <uuid>] [--dry-run]
control-wawptn vote cast --pick <game names or 1-based positions, comma-separated> [--group <uuid>] [--dry-run]
control-wawptn vote close [--group <uuid>] [--dry-run]
control-wawptn vote show [--group <uuid>]

--group defaults to the run's last group (from \`group create\`).
start   As a member (usually the owner): /groups/<id>, click "Lancer un vote", keep every player
        checked in "Qui joue ce soir ?", click "Lancer le vote". Captures POST /api/groups/<id>/vote
        (201, the games on the ballot) and checks the page moved to /groups/<id>/vote.
cast    As the logged-in player: /groups/<id>/vote, click "Sélectionner <game>" for each pick, click
        "Valider ma sélection". Captures the POST, the "Vote soumis !" state and the player's votes
        rows (one yes/no row per game on the ballot). Example: --pick "Fake Kart Party,Verify Quest" or --pick 1,3
close   As the session creator: click "Clôturer le vote et révéler le gagnant", capture POST .../close,
        read "Ce soir vous jouez à" + the winner heading, and compare with voting_sessions.winning_game_name.
show    Read-only: latest session row, its games and every player's ballot.
--dry-run   start/cast/close: print the steps without touching the browser.`,
  async run(flags, pos) {
    const sub = pos[0]
    const state = requireState()
    const groupId = resolveGroup(state, flags)
    if (sub === 'show') {
      const s = sessionRow(groupId)
      return { ok: true, session: s, games: s ? psqlJson(`select steam_app_id as "appId", game_name as "game" from voting_session_games where session_id = ${q(s.id)} order by game_name`) : [], ballots: s ? Object.fromEntries(Object.entries(USERS).map(([k, u]) => [k, ballot(s.id, u.steamId)])) : {} }
    }
    if (!['start', 'cast', 'close'].includes(sub)) fail(`Unknown vote subcommand "${sub ?? ''}".`, 'Use `vote start`, `vote cast --pick ...`, `vote close` or `vote show`.')
    if (sub === 'cast' && !flags.pick) fail('Say which games to pick.', 'Pass --pick "Fake Kart Party,Verify Quest" or --pick 1,2 (positions on the ballot).')
    if (flags['dry-run']) return { ok: true, dryRun: true, groupId, steps: { start: ['goto /groups/<id>', 'click "Lancer un vote"', 'click "Lancer le vote" (dialog)'], cast: ['goto /groups/<id>/vote', `click "Sélectionner ..." for ${flags.pick}`, 'click "Valider ma sélection"'], close: ['goto /groups/<id>/vote', 'click "Clôturer le vote et révéler le gagnant"'] }[sub] }
    const player = currentPlayer(state)
    const { browser, page } = await connect()
    try {
      if (sub === 'start') {
        await page.goto(`${BASE}/groups/${groupId}`, { waitUntil: 'networkidle' })
        await page.getByRole('button', { name: /^Lancer un vote$/ }).first().click()
        const dialog = page.getByRole('dialog', { name: /Qui joue ce soir/ })
        await dialog.waitFor({ timeout: 10000 })
        const players = await dialog.getByRole('checkbox').evaluateAll((els) => els.map((e) => ({ label: e.getAttribute('aria-label') || e.closest('label')?.textContent?.trim() || '', checked: e.getAttribute('aria-checked') === 'true' || e.checked === true })))
        await page.screenshot({ path: shotPath(state, 'vote-setup') })
        const respP = page.waitForResponse((r) => new RegExp(`/api/groups/${groupId}/vote$`).test(r.url()) && r.request().method() === 'POST', { timeout: 15000 })
        await dialog.getByRole('button', { name: /^Lancer le vote$/ }).click()
        const resp = await respP
        const body = await resp.json().catch(() => null)
        await page.waitForURL(/\/vote$/, { timeout: 10000 }).catch(() => {})
        await page.getByRole('heading', { name: /Choisis tes jeux/ }).waitFor({ timeout: 10000 }).catch(() => {})
        const file = shotPath(state, 'vote-started')
        await page.screenshot({ path: file })
        const session = sessionRow(groupId)
        const ok = resp.status() === 201 && session?.status === 'open' && page.url().endsWith('/vote')
        if (!ok) process.exitCode = 1
        const result = { ok, player: player.key, setupDialogPlayers: players, response: { status: resp.status(), sessionId: body?.session?.id, games: body?.games?.map((g) => g.gameName) }, session, url: page.url(), file }
        saveJson(state, 'vote-started', result)
        return result
      }
      await page.goto(`${BASE}/groups/${groupId}/vote`, { waitUntil: 'networkidle' })
      if (sub === 'cast') {
        await page.getByRole('heading', { name: /Choisis tes jeux/ }).waitFor({ timeout: 10000 }).catch(() => fail('The ballot is not showing on /groups/<id>/vote.', 'Run `control-wawptn vote show`: no open session (run `vote start`), or this player already voted.'))
        const cards = page.getByRole('button', { name: /^Sélectionner / })
        const names = (await cards.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') || e.textContent))).map((n) => n.replace(/^Sélectionner /, '').trim())
        const picks = String(flags.pick).split(',').map((p) => p.trim()).filter(Boolean).map((p) => (/^\d+$/.test(p) ? names[Number(p) - 1] : p))
        const unknown = picks.filter((p) => !p || !names.includes(p))
        if (unknown.length) fail(`Not on the ballot: ${unknown.join(', ') || '(bad position)'}.`, `Pick from: ${names.join(', ')}.`)
        for (const p of picks) await page.getByRole('button', { name: `Sélectionner ${p}`, exact: true }).click()
        await page.screenshot({ path: shotPath(state, `vote-cast-${player.key}-before`) })
        const respP = page.waitForResponse((r) => /\/api\/groups\/[^/]+\/vote\/[^/]+$/.test(r.url()) && r.request().method() === 'POST', { timeout: 15000 })
        await page.getByRole('button', { name: /^Valider ma sélection$/ }).click()
        const resp = await respP
        await page.getByRole('heading', { name: /Vote soumis/ }).waitFor({ timeout: 10000 }).catch(() => {})
        const progress = await page.getByRole('status').first().textContent().catch(() => null)
        const file = shotPath(state, `vote-cast-${player.key}-after`)
        await page.screenshot({ path: file })
        const s = sessionRow(groupId)
        const rows = ballot(s.id, player.steamId)
        const yes = rows.filter((r) => r.vote).map((r) => r.game).sort()
        const ok = resp.ok() && yes.join('|') === [...picks].sort().join('|') && rows.length === names.length
        if (!ok) process.exitCode = 1
        const result = { ok, player: player.key, ballotShown: names, picks, response: { status: resp.status() }, progressShown: progress, votesRows: rows, file }
        saveJson(state, `vote-cast-${player.key}`, result)
        return result
      }
      // close
      const closeBtn = page.getByRole('button', { name: /Clôturer le vote et révéler le gagnant/ })
      await closeBtn.waitFor({ timeout: 10000 }).catch(() => fail('No "Clôturer le vote" button.', 'Only the session creator sees it, after casting their own ballot. `login --as` the owner and `vote cast` first.'))
      const progress = await page.getByRole('status').first().textContent().catch(() => null)
      await page.screenshot({ path: shotPath(state, 'vote-close-before') })
      const respP = page.waitForResponse((r) => r.url().endsWith('/close') && r.request().method() === 'POST', { timeout: 15000 })
      await closeBtn.click()
      const resp = await respP
      const body = await resp.json().catch(() => null)
      await page.getByText(/Ce soir vous jouez à/).waitFor({ timeout: 10000 }).catch(() => {})
      await sleep(1500) // reveal animation
      const shownWinner = await page.getByRole('heading', { level: 1 }).first().textContent().catch(() => null)
      const file = shotPath(state, 'vote-result')
      await page.screenshot({ path: file })
      const s = sessionRow(groupId)
      const ok = resp.ok() && s?.status === 'closed' && !!s.winner && s.winner === body?.result?.gameName && shownWinner?.trim() === s.winner
      if (!ok) process.exitCode = 1
      const result = { ok, player: player.key, progressBeforeClose: progress, response: { status: resp.status(), result: body?.result }, winnerShown: shownWinner, session: s, file }
      saveJson(state, 'vote-result', result)
      return result
    } finally {
      await browser.close()
    }
  },
}

function readJsonl(file) {
  if (!fs.existsSync(file)) return []
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
}
COMMANDS.console = {
  summary: 'Browser console messages recorded by the daemon (all pages, since launch).',
  help: 'control-wawptn console [--level error|warning|log] [--last N] [--grep <regex>]\n\nReads .verify-run/console.jsonl (copied into evidence on teardown).',
  async run(flags) {
    requireState()
    let rows = readJsonl(path.join(RUN_DIR, 'console.jsonl'))
    if (flags.level) rows = rows.filter((r) => r.type === flags.level)
    if (flags.grep) rows = rows.filter((r) => new RegExp(flags.grep, 'i').test(r.text))
    const last = parseInt(flags.last || '50', 10)
    return { ok: true, total: rows.length, messages: rows.slice(-last) }
  },
}
COMMANDS['network-log'] = {
  summary: 'HTTP + socket.io traffic recorded by the daemon (method, url, status, frames).',
  help: 'control-wawptn network-log [--filter <substring>] [--status-min 400] [--last N]\n\nReads .verify-run/network.jsonl. Blocked third-party requests show status "blocked".\nExample: control-wawptn network-log --filter socket.io --last 20',
  async run(flags) {
    requireState()
    let rows = readJsonl(path.join(RUN_DIR, 'network.jsonl'))
    if (flags.filter) rows = rows.filter((r) => r.url.includes(flags.filter))
    if (flags['status-min']) rows = rows.filter((r) => typeof r.status === 'number' && r.status >= parseInt(flags['status-min'], 10))
    const last = parseInt(flags.last || '50', 10)
    return { ok: true, total: rows.length, requests: rows.slice(-last) }
  },
}

// Internal: the long-lived browser owner, spawned by launch.
async function browserd() {
  const { chromium } = loadPlaywright()
  const ctx = await chromium.launchPersistentContext(path.join(RUN_DIR, 'browser-profile'), {
    headless: true,
    viewport: { width: 1280, height: 860 },
    locale: 'fr-FR',
    serviceWorkers: 'block',
    args: [`--remote-debugging-port=${PORTS.cdp}`],
  })
  const con = fs.createWriteStream(path.join(RUN_DIR, 'console.jsonl'), { flags: 'a' })
  const netw = fs.createWriteStream(path.join(RUN_DIR, 'network.jsonl'), { flags: 'a' })
  // External boundary: Steam CDN images get a local placeholder; any other third-party request is refused.
  await ctx.route((url) => !['localhost', '127.0.0.1'].includes(url.hostname), (route) => {
    const url = route.request().url()
    if (/steamstatic\.com|steamcdn/.test(url)) {
      const label = (url.match(/apps\/(\d+)/) || [])[1] || 'avatar'
      return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: `<svg xmlns="http://www.w3.org/2000/svg" width="460" height="215"><rect width="100%" height="100%" fill="#2b2140"/><text x="50%" y="50%" fill="#c9b8ff" font-family="sans-serif" font-size="28" text-anchor="middle">fake ${label}</text></svg>` })
    }
    netw.write(JSON.stringify({ ts: new Date().toISOString(), method: route.request().method(), url, status: 'blocked' }) + '\n')
    return route.abort('blockedbyclient')
  })
  // Production sits behind Traefik with `trust proxy` = 1, so the rate limiters key on each player's own
  // IP. Locally every fake player comes from 127.0.0.1 through the Vite proxy and they would share one
  // budget (voteLimiter: 30/min on /api/groups). Add the header Traefik would add: one address per player.
  const playerIps = Object.fromEntries(Object.keys(USERS).map((k, i) => [k, `10.77.0.${i + 1}`]))
  await ctx.route((url) => ['localhost', '127.0.0.1'].includes(url.hostname) && url.pathname.startsWith('/api/'), (route) => {
    const ip = playerIps[readState()?.currentPlayer]
    if (!ip) return route.continue()
    return route.continue({ headers: { ...route.request().headers(), 'x-forwarded-for': ip } })
  })
  const attach = (page) => {
    page.on('console', (m) => con.write(JSON.stringify({ ts: new Date().toISOString(), type: m.type(), text: m.text(), url: page.url() }) + '\n'))
    page.on('pageerror', (e) => con.write(JSON.stringify({ ts: new Date().toISOString(), type: 'pageerror', text: e.message, url: page.url() }) + '\n'))
    page.on('requestfinished', async (req) => {
      const res = await req.response().catch(() => null)
      netw.write(JSON.stringify({ ts: new Date().toISOString(), method: req.method(), url: req.url(), status: res?.status() ?? null, ms: Math.round(req.timing().responseEnd) }) + '\n')
    })
    page.on('requestfailed', (req) => netw.write(JSON.stringify({ ts: new Date().toISOString(), method: req.method(), url: req.url(), status: null, failure: req.failure()?.errorText }) + '\n'))
    // socket.io runs over WebSocket (vote progress, results, member events): log frames so pushes can be proven.
    page.on('websocket', (ws) => {
      const log = (dir, payload) => netw.write(JSON.stringify({ ts: new Date().toISOString(), method: 'WS', dir, url: ws.url(), status: 101, frame: String(payload).slice(0, 300) }) + '\n')
      log('open', '')
      ws.on('framereceived', (f) => log('in', f.payload))
      ws.on('framesent', (f) => log('out', f.payload))
    })
  }
  ctx.pages().forEach(attach)
  ctx.on('page', attach)
  if (!ctx.pages().length) await ctx.newPage()
  const stop = async () => { await ctx.close().catch(() => {}); process.exit(0) }
  process.on('SIGTERM', stop)
  process.on('SIGINT', stop)
  setInterval(() => {}, 1 << 30)
}

function usage() {
  const lines = Object.entries(COMMANDS).map(([k, c]) => `  ${k.padEnd(12)} ${c.summary}`)
  return `control-wawptn — drive a throwaway local WAWPTN instance like a group of players.

Usage: control-wawptn <command> [flags]      (JSON on stdout; exit 1 on failure)

Health:       doctor, info, teardown
Lifecycle:    launch
Navigation:   goto, login
Interaction:  click, key, group, vote
Inspection:   screenshot, snapshot
Streaming:    console, network-log

${lines.join('\n')}

Typical run (one group session, three fake players):
  control-wawptn launch && control-wawptn doctor
  control-wawptn login --as alice && control-wawptn group create --name "Soirée test"
  control-wawptn login --as bob && control-wawptn group join
  control-wawptn login --as carol && control-wawptn group join
  control-wawptn login --as alice && control-wawptn vote start
  control-wawptn vote cast --pick 1,2   (then bob and carol; login --as each)
  control-wawptn vote close && control-wawptn teardown

Evidence goes to ${EVIDENCE_ROOT}/<runId>/ and survives teardown.
\`control-wawptn <command> --help\` for details. Commands with side effects accept --dry-run.`
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2)
  if (cmd === '__browserd') return browserd()
  if (!cmd || cmd === '--help' || cmd === '-h' || cmd === 'help') { process.stdout.write(usage() + '\n'); return }
  const c = COMMANDS[cmd]
  if (!c) {
    out({ ok: false, error: `Unknown command "${cmd}".`, fix: `Run \`control-wawptn --help\`. Commands: ${Object.keys(COMMANDS).join(', ')}` })
    process.exitCode = 1
    return
  }
  const { pos, flags } = parseArgs(rest)
  if (flags.help || flags.h) { process.stdout.write(c.help + '\n'); return }
  try {
    out(await c.run(flags, pos))
  } catch (e) {
    out({ ok: false, command: cmd, error: e.message, fix: e.fix || 'Run `control-wawptn doctor` and read .verify-run/logs/.', ...(e.extra || {}) })
    process.exitCode = 1
  }
}
main()
