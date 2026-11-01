# Implementation Plan: ScreenTime Guard (working title)

Companion to `PRD.md`. This document turns the PRD into an ordered, checkable build plan. Requirement IDs (e.g., `FR-1.2`) refer to the PRD.

**How to use this plan**
- Work top to bottom. Each milestone ends with a **Definition of Done (DoD)**; do not start the next milestone until the DoD is met.
- Check items off (`- [x]`) as you complete them and commit this file with your progress.
- Time estimates assume part-time work (about 10 to 15 hours/week) and are rough guides, not promises.
- **Ship Phase 1 before touching Phase 2.** The local-only extension is already a useful product.

**Legend:** 🔴 critical path · 🟡 important · 🟢 nice to have

---

## Overview

| Phase | Goal | Est. duration | Ships as |
|---|---|---|---|
| **Phase 0** | Decisions, setup, tooling | 3 to 5 days | Repo + CI |
| **Phase 1** | Local-only MVP (track, limit, block, report) | 6 to 8 weeks | v0.1 to v1.0 |
| **Phase 2** | Cloud sync + parent dashboard | 6 to 8 weeks | v1.x + dashboard |
| **Phase 3** | Expansion (browsers, network, self-host, i18n) | 4 to 6 weeks | v2.0 |
| **Phase 4** | Future ideas | Ongoing | Backlog |

---

# Phase 0: Decisions and Project Setup

**Goal:** remove ambiguity and get a clean, automated workspace before writing feature code.

## 0.1 Resolve open decisions (from PRD section 14)
- [x] 🔴 Choose the **project name** (check GitHub, npm, and Chrome Web Store for conflicts) — decided: working title "ScreenTime Guard"; verify store availability before public release
- [x] 🔴 Choose the **license** (MIT for adoption vs. AGPL-3.0 to discourage closed hosted forks) — decided: AGPL-3.0
- [ ] 🟡 Decide **Convex vs. Supabase** for Phase 2 (can be deferred, but note the decision criteria: real-time vs. SQL/RLS/self-hosting)
- [x] 🟡 Decide **distribution** for v0.1: GitHub release (unpacked/zip) first, Chrome Web Store at v1.0 — decided: GitHub Release (zip) for v0.1; Web Store submission at v1.0
- [x] 🟡 Decide **tracking granularity** for v1: domain-only (recommended) — decided: domain-only (registrable domain; no per-path/URL tracking)
- [x] 🟢 Decide how to handle **shared family computers** (document the recommended approach: one Chrome profile per child) — documented in `docs/family-computers.md`

## 0.2 Repository setup
- [x] 🔴 Create the GitHub repo (public) with `LICENSE`, `README.md` (stub), `.gitignore` — done: https://github.com/sirLass/screentime-guard-
- [x] 🔴 Set up a **monorepo** (pnpm workspaces) with the structure from PRD 7.7:
  - [x] `apps/extension`
  - [x] `packages/shared`
  - [x] `docs/`
  - [ ] (Phase 2) `apps/dashboard`, `backend/`
- [x] 🟡 Add `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, issue and PR templates
- [x] 🟡 Add a `CHANGELOG.md` (Keep a Changelog format) and decide on semantic versioning
- [ ] 🟡 Create a GitHub Project board with columns: Backlog / In progress / Review / Done
- [ ] 🟡 Convert each milestone below into GitHub milestones and each checklist group into issues

## 0.3 Tooling
- [x] 🔴 Scaffold the extension with **WXT** (`pnpm dlx wxt@latest init`), choose **React + TypeScript** — WXT 0.21 + React 19 + TS 5.9
- [x] 🔴 Enable TypeScript **strict mode**
- [x] 🟡 Configure **ESLint** + **Prettier**
- [x] 🟡 Add **Husky + lint-staged** (lint and format on commit)
- [x] 🟡 Add **Tailwind CSS** to the extension UI
- [x] 🟡 Add **Vitest** (with WXT's testing helpers/fake browser) and a sample passing test
- [ ] 🟡 Add **Playwright** (set up later in M2 to M3; install now if convenient)
- [x] 🔴 Create **GitHub Actions CI**: install, lint, type-check, unit tests, build on every PR — workflow created; verify it is green on the first push
- [x] 🟢 Add **Dependabot** and a lockfile policy (commit `pnpm-lock.yaml`)

## 0.4 Verify the dev loop
- [x] 🔴 Run `pnpm dev`, load the extension in Chrome, and confirm hot reload works — automated via `scripts/dev-chrome.ps1` (`pnpm dev:chrome`): builds the extension, launches Chrome with an isolated dev profile and the extension preloaded; launcher verified end-to-end (Chrome launched on the dev build). Visual HMR confirmation on first interactive run pending; Chrome 137+ may need one manual "Load unpacked" (see `docs/dev-profile.md`)
- [x] 🔴 Confirm `pnpm build` produces a loadable production build
- [x] 🟡 Create a **separate Chrome test profile** for development so your own browsing is not affected — auto-created on first `pnpm dev:chrome` run at `.chrome-dev-profile/` (gitignored); see `docs/dev-profile.md`

**DoD (Phase 0):** repo is public, CI is green on `main`, a "hello world" popup loads from a dev build, and the name/license decisions are recorded.

---

# Phase 1: Local-Only MVP

**Goal:** a child-safe, parent-controlled extension that tracks active time per site, enforces daily limits offline, and shows reports. No server.

## Milestone M1: Foundation (Week 1)
*Covers: storage layer, shared types, migrations.*

### Shared types and utilities
- [x] 🔴 Define TypeScript types in `packages/shared`: `Settings`, `Rule`, `Extension` (time grant), `UsageDay`, `Session` (PRD 7.5) — `src/types.ts`; named `TimeExtension` instead of PRD's `Extension` (avoids clashing with the extension concept)
- [x] 🔴 Write a **domain normalization** helper (lowercase, strip `www.`, extract registrable domain, handle ports and IPs) — `src/domain.ts` (`parseHost`, `registrableDomain`, `usageDomainKey`); rejects non-http(s) schemes so `chrome://` pages can never become domains
- [x] 🔴 Write a **domain matching** helper (rule `youtube.com` matches `m.youtube.com` and `music.youtube.com`) — `src/domain.ts` (`matchesDomain`); label-boundary-safe (`notyoutube.com` never matches)
- [x] 🟡 Write date helpers (`today()` in local time, day rollover detection, day-of-week) — `src/date.ts` (local day keys, `hasDayRolled`, `dayOfWeek`, midnight alarms, time-window checks)
- [x] 🟡 Write validation (zod or hand-rolled) for rules: domain format, limit 0 to 1440, valid time windows — hand-rolled `src/validate.ts` (zero-dependency budget decision)
- [x] 🔴 Unit tests for all helpers (include edge cases: IDN domains, `localhost`, `chrome://`, `about:blank`, extension pages) — 50 tests, coverage 90%+ enforced in `vitest.config.ts`

### Storage layer
- [x] 🔴 Create a typed `storage.ts` wrapper over `chrome.storage.local` (get/set/update with defaults) — `apps/extension/lib/storage.ts` with a injectable `StorageArea` (Map-fake tested)
- [x] 🔴 Add **schema versioning** (`schemaVersion`) and a migration runner — `SCHEMA_VERSION = 2`, pure `migrateStore` (deep-clones, newer-version data never downgraded) + `ensureSchema`
- [x] 🟡 Add atomic update helper to avoid race conditions between popup/options and the service worker — per-key promise queue in `updateStore` (100 concurrent increments test passes)
- [x] 🟡 Add a storage **change listener** utility so UI reacts to updates — typed `onStoreChanged` (filtered to `local`, returns unsubscribe)
- [x] 🔴 Unit tests: defaults, migrations (v1 to v2 sample), concurrent updates — storage tests incl. corrupt-slice repair and reset path

### Messaging
- [x] 🟡 Define a typed message protocol between UI and background (e.g., `GET_STATUS`, `ADD_RULE`, `VERIFY_PIN`, `GRANT_EXTENSION`) — `apps/extension/lib/messages.ts` (`BackgroundRequest`/`BackgroundResponse` unions, `sendToBackground` with null-safe degrade)
- [x] 🟡 Validate message senders (only extension pages may send privileged messages) — pure `isPrivilegedSender`; content scripts (same sender id, web URL) and foreign extensions explicitly tested as rejected

**DoD (M1):** shared package builds, storage wrapper and helpers have 90%+ test coverage, CI green.

---

## Milestone M2: Time Tracker (Weeks 2 to 3) 🔴
*Covers: FR-1.1 to FR-1.9.*

### Core tracking
- [ ] 🔴 Implement the **session model** (`currentSession` stored in storage: domain, startedAt, lastTickAt)
- [ ] 🔴 Handle events and re-evaluate the session on each:
  - [ ] `tabs.onActivated`
  - [ ] `tabs.onUpdated` (URL change/complete)
  - [ ] `tabs.onRemoved`
  - [ ] `windows.onFocusChanged` (including `WINDOW_ID_NONE` = browser unfocused)
  - [ ] `idle.onStateChanged` (active / idle / locked)
  - [ ] `runtime.onStartup` and `runtime.onInstalled`
  - [ ] `alarms.onAlarm` (periodic tick)
- [ ] 🔴 Implement `closeSession()`: `elapsed = min(now - lastTickAt, MAX_TICK)` and add to today's `byDomain` (cap prevents counting sleep time)
- [ ] 🔴 Implement `startSession()` only when: window focused, tab active, valid trackable domain, state is active (or tab is audible)
- [ ] 🔴 Set `chrome.idle.setDetectionInterval` from settings (default 60s)
- [ ] 🔴 **Audible-tab exception** (FR-1.4): keep counting when `tab.audible` is true even if idle
- [ ] 🟡 Handle **multiple windows** (track the focused window's active tab only; no double counting)
- [ ] 🟡 Ignore non-trackable URLs: `chrome://`, `chrome-extension://`, `about:`, `file://`, new tab page, the extension's own pages
- [ ] 🟡 Handle **Picture-in-Picture / video in a background window** (document the chosen behavior)

### Resilience (MV3 service worker)
- [ ] 🔴 Register a recurring **alarm** (30-second period or longer) that ticks and persists
- [ ] 🔴 Never rely on in-memory state alone; reload session state from storage at the start of every handler
- [ ] 🔴 Persist at least every 10 to 15 seconds of active use (FR-1.7)
- [ ] 🟡 Handle **sleep/wake** and **suspend** (large gaps in time are capped, not counted)
- [ ] 🟡 Handle **system clock changes** (detect large backward/forward jumps, log, and avoid corrupting totals) (FR-5.4)
- [ ] 🟡 Handle **day rollover** while a session is active (split time across midnight correctly)
- [ ] 🟢 Optional hourly buckets (`byHour`) for the time-of-day heatmap

### Testing
- [ ] 🔴 Unit tests with a mocked clock for: tab switching, idle transitions, window blur, sleep gap, midnight rollover, audible exception
- [ ] 🔴 **Manual accuracy test** with a stopwatch across scenarios (record results in `docs/accuracy-tests.md`):
  - [ ] Single tab, active use (10 min)
  - [ ] Multiple tabs switching
  - [ ] Watching a video with no input
  - [ ] Walking away (idle)
  - [ ] Two windows
  - [ ] Lid close and reopen
- [ ] 🟡 Target: within ±5% of stopwatch in all scenarios

### Developer tooling
- [ ] 🟡 Build a temporary **debug panel** (options page, dev only) showing current session, today's usage, and recent events

**DoD (M2):** tracker passes unit tests and the manual accuracy test; usage survives service-worker restarts and browser restarts (max 15s loss).

---

## Milestone M3: Rules and Blocking (Weeks 3 to 4) 🔴
*Covers: FR-2.x, FR-3.1 to FR-3.4.*

### Rule engine
- [ ] 🔴 Implement `evaluate(domain, usage, rules, extensions, now)` returning `{ allowed, remainingSec, reason }`
- [ ] 🔴 Support limit types: number of minutes, `0` (always blocked), `null` (track only)
- [ ] 🟡 Support **day-of-week overrides** (weekday vs. weekend)
- [ ] 🟡 Support **allowed time windows** (including windows that cross midnight)
- [ ] 🟡 Support **global "all sites" daily limit**
- [ ] 🟡 Support **time extensions** (+N minutes for today, expiring at day end)
- [ ] 🔴 Run evaluation after every usage update and on rule changes
- [ ] 🔴 Exhaustive unit tests (table-driven) for all combinations

### Blocker (declarativeNetRequest)
- [ ] 🔴 Add `declarativeNetRequest` permission and a **blocked page** entrypoint (`blocked.html`)
- [ ] 🔴 Implement `blockDomain(domain)`: add a **dynamic rule** (`redirect` for `main_frame` to `/blocked.html?domain=...&reason=...`)
- [ ] 🔴 Implement `unblockDomain(domain)` and `syncBlockRules()` (reconcile dynamic rules with current evaluation state)
- [ ] 🔴 Use stable **rule IDs** derived from the domain (hash) to avoid duplicates
- [ ] 🔴 **Redirect already-open tabs** on a newly blocked domain within 5s (query tabs by URL, `tabs.update`)
- [ ] 🟡 Include subdomains in the block rule (`requestDomains`)
- [ ] 🟡 Re-run `syncBlockRules()` on startup, install/update, and rule/usage changes
- [ ] 🔴 **Daily reset alarm** at local midnight: clear block rules, new daily bucket (and re-check on startup in case the browser was closed)
- [ ] 🟡 Handle DNR limits (dynamic rule count limits) gracefully with an error and UI message

### Blocked ("Time's up") page
- [ ] 🔴 Build the React page: friendly message, blocked domain, limit reached, reset time
- [ ] 🟡 Show the reason variants: limit reached / outside allowed hours / always blocked
- [ ] 🟡 Add a **PIN override** form (grants temporary access, e.g., 15 minutes) (FR-3.7)
- [ ] 🟡 Escape/sanitize the `domain` query parameter (avoid injection and open-redirect issues)
- [ ] 🟢 Add a "go back" / "open a new tab" button

### Warnings
- [ ] 🟡 Implement the **5-minute warning** (FR-3.6) via a content-script toast (preferred) or `chrome.notifications` (needs permission)
- [ ] 🟡 Warn only once per site per day (store a flag)

### Testing
- [ ] 🔴 Playwright E2E with the extension loaded: visit a test domain, hit a small limit (e.g., 1 minute), verify redirect and that reload remains blocked
- [ ] 🔴 E2E: midnight reset (simulate via date override in test mode)
- [ ] 🟡 E2E: PIN override unblocks temporarily, then re-blocks

**DoD (M3):** a parent-defined limit (hard-coded or dev-UI for now) reliably blocks the site within 5 seconds of reaching it, survives browser restart, and unblocks at reset.

---

## Milestone M4: Settings, PIN, and Child Popup (Weeks 5 to 6) 🔴
*Covers: FR-4.x, FR-6.1, FR-7.x, section 8.1 to 8.2.*

### PIN security
- [ ] 🔴 Implement `pin.ts`: salted hash via WebCrypto **PBKDF2** (high iteration count) or Argon2 (WASM)
- [ ] 🔴 Implement `verifyPin()` with constant-time comparison
- [ ] 🔴 Implement **lockout** after 5 failed attempts with escalating delays (1, 5, 15 min); persist attempt state
- [ ] 🟡 Implement **session unlock** for the options page (auto-lock after N minutes of inactivity)
- [ ] 🟡 Implement **PIN change** (requires current PIN)
- [ ] 🟡 Implement the documented **local reset path** (wipes all data; clear warning) (FR-4.5)
- [ ] 🔴 Unit tests: hashing, verification, lockout timing, no plaintext in storage

### Setup wizard
- [ ] 🔴 Step 1: Welcome + exactly what is and isn't tracked (privacy transparency)
- [ ] 🔴 Step 2: Create PIN (with confirmation)
- [ ] 🟡 Step 3: Choose template (Study / Balanced / Strict / Custom) or skip
- [ ] 🟡 Step 4: Add first sites with limits
- [ ] 🟡 Step 5: Summary + link to the "Make it harder to remove" guide
- [ ] 🟡 Run the wizard automatically on `runtime.onInstalled` (reason `install`)

### Options page
- [ ] 🔴 PIN gate / lock screen
- [ ] 🔴 **Rules page**: list, add, edit, delete; domain input with validation and popular-site suggestions
- [ ] 🟡 Day-of-week overrides UI
- [ ] 🟡 Allowed time windows UI
- [ ] 🟡 Grant-extra-time action (+5/+15/+30 min)
- [ ] 🔴 **Today's usage** dashboard with progress bars vs. limits
- [ ] 🟡 **Security/settings page**: idle threshold, warning time, retention days, change PIN
- [ ] 🟡 Danger zone: export data, delete all data (with confirmation)
- [ ] 🟡 Form validation and clear error messages
- [ ] 🟡 Light/dark mode

### Popup (child view)
- [ ] 🟡 Show current site, time used vs. limit (progress ring), time left, today's total (FR-7.1)
- [ ] 🟡 Badge text showing minutes remaining for the current site (FR-7.2)
- [ ] 🟡 "Open settings" button (leads to PIN gate)
- [ ] 🟢 Friendly empty state when no rules exist

### Accessibility and UX
- [ ] 🟡 Keyboard navigation and focus management throughout
- [ ] 🟡 ARIA labels, sufficient color contrast (WCAG 2.1 AA)
- [ ] 🟡 Plain-language copy review (non-technical parent test)
- [ ] 🟡 Prepare i18n structure (message keys via `browser.i18n` or a small library), English only for now

**DoD (M4):** a non-technical person can install, set a PIN, add a limit, and see it enforced without reading docs; PIN is never stored in plain text.

---

## Milestone M5: Reports, Data, and Polish (Weeks 6 to 7)
*Covers: FR-6.x, 6.4 retention.*

### Reports
- [ ] 🟡 Date range selector: today / 7 days / 30 days
- [ ] 🟡 Charts with Recharts: daily total (bar), per-site breakdown, trend (line)
- [ ] 🟡 Top sites list
- [ ] 🟢 Time-of-day heatmap (needs hourly buckets)
- [ ] 🟡 "Limits reached" counter per site
- [ ] 🟡 Empty and loading states

### Data management
- [ ] 🟡 **Retention job**: delete usage older than N days (default 90) on a daily alarm
- [ ] 🟡 **Export** to CSV and JSON (via Blob download from the options page)
- [ ] 🟡 **Import/backup** of rules (JSON) so parents can move settings between machines
- [ ] 🟡 **Delete all data** flow, tested

### Hardening and quality
- [ ] 🔴 **Permission audit**: remove anything unused; justify each permission in writing (for Web Store)
- [ ] 🟡 Evaluate **optional host permissions** to reduce the install warning scope
- [ ] 🟡 Error handling: wrap storage and API calls, add a lightweight **local error log** (viewable in settings, never sent anywhere)
- [ ] 🟡 Performance check: CPU and memory in Chrome Task Manager during a 1-hour session
- [ ] 🟡 Review service-worker logs for errors over a multi-day soak test (run it on your own test profile for 3+ days)
- [ ] 🟡 Unit test coverage ≥ 80% on core logic (tracker, rules, pin, storage)

### Tamper testing (FR-5.x)
- [ ] 🔴 Test and document: disable/remove extension, incognito, new profile, guest mode, other browser, clear browsing data, change system clock
- [ ] 🔴 Verify extension storage is not reachable from web pages or content scripts
- [ ] 🟡 Record results in `docs/tamper-resistance.md` with mitigation for each

**DoD (M5):** reports render correctly with realistic data, exports work, permission justification doc is written, soak test shows no crashes or drift.

---

## Milestone M6: Documentation and Release v1.0 (Week 8)

### Documentation
- [ ] 🔴 **README**: what it does, screenshots/GIF, install, quick start, limits (be honest), FAQ
- [ ] 🔴 `docs/privacy-policy.md` (plain language: what's collected, where it's stored, how to delete)
- [ ] 🔴 `docs/make-it-harder-to-remove.md`: force-install with `ExtensionInstallForcelist`, `IncognitoModeAvailability`, restricting other browsers/profiles (per OS: Windows registry/GPO, macOS profiles, Linux policies, ChromeOS); verify steps against current Chrome Enterprise docs
- [ ] 🟡 `docs/architecture.md` (diagram + decisions)
- [ ] 🟡 `docs/development.md` (setup, scripts, how to test)
- [ ] 🟡 `docs/accuracy-tests.md` and `docs/tamper-resistance.md` (from earlier milestones)
- [ ] 🟡 Short **demo video** (2 to 3 minutes)

### Release engineering
- [ ] 🔴 Version bump, update `CHANGELOG.md`, tag `v1.0.0`
- [ ] 🔴 GitHub Action to build and attach a **zipped extension** to each release
- [ ] 🔴 **Chrome Web Store** listing:
  - [ ] Developer account (one-time registration fee)
  - [ ] Store description with a single clear purpose
  - [ ] Screenshots (1280×800), small/large promo tiles, icon (128×128)
  - [ ] Permission justifications and privacy practices form (limited use disclosure)
  - [ ] Hosted privacy policy URL
- [ ] 🟡 Plan for review delays (can take days to weeks); submit early
- [ ] 🟡 Add the **Edge Add-ons** listing (Chromium build is compatible; usually quick)
- [ ] 🟡 Announce: GitHub topics, README badges, posts (Reddit r/opensource, r/privacy, Philippine dev communities, Product Hunt/Hacker News "Show HN")

### Beta feedback
- [ ] 🟡 Recruit 3 to 5 real families for a **closed beta** before public launch
- [ ] 🟡 Collect feedback: setup difficulty, accuracy, bypass attempts, confusing copy
- [ ] 🟡 Triage and fix top issues, then release v1.0

**DoD (Phase 1):** v1.0 released on GitHub (and submitted to the Web Store); at least 3 families have used it for a week; no known data-loss or blocking bugs.

---

# Phase 2: Cloud Sync and Parent Dashboard

**Goal:** remote control and multi-device visibility, **optional** and without breaking local-only mode.

> Do not start until Phase 1 is released and you have user feedback. Revisit the PRD's open questions first.

## Milestone M7: Backend Foundation (Weeks 1 to 2)

### Decisions and setup
- [ ] 🔴 Finalize **Convex vs. Supabase** (record in `docs/adr/0001-backend.md`)
- [ ] 🔴 Create the backend project and environments (dev / prod)
- [ ] 🔴 Define the schema (PRD 7.5): `parents`, `children`, `devices`, `rules`, `extensions_granted`, `usage_daily`, `time_requests`, `alerts`
- [ ] 🔴 Implement **authorization**: every query/mutation scoped to the authenticated parent's children (RLS policies for Supabase, auth checks for Convex)
- [ ] 🔴 Write **security tests** proving parent A can never read or write parent B's data
- [ ] 🟡 Rate limiting on auth, pairing, and sync endpoints
- [ ] 🟡 Seed data and local dev instructions
- [ ] 🟡 Backups and a data retention policy for hosted data

### Auth
- [ ] 🔴 Parent signup/login (email+password and/or OAuth), email verification, password reset
- [ ] 🟡 Optional 2FA for parent accounts
- [ ] 🟡 Account deletion flow that deletes all child data (privacy requirement)

**DoD (M7):** schema deployed, auth works, cross-account access tests pass.

---

## Milestone M8: Pairing and Sync (Weeks 3 to 4)

### Pairing
- [ ] 🔴 Dashboard: "Add device" generates a **short-lived pairing code** (10 min, single-use) and optional QR
- [ ] 🔴 Extension: "Link to parent account" screen (requires local PIN), submit code, receive **device token**
- [ ] 🔴 Store the device token securely in `chrome.storage.local` (never exposed to content scripts)
- [ ] 🟡 Unlink flow (both sides) and token revocation

### Upload (extension → backend)
- [ ] 🔴 Sync client with an **offline queue** and exponential backoff
- [ ] 🔴 Upload usage deltas every 5 minutes (**idempotent**: keyed by device + date + domain, use absolute daily totals or monotonic counters)
- [ ] 🔴 Immediate upload on **limit reached** events
- [ ] 🔴 **Heartbeat** every 5 minutes with extension version (FR-5.5)
- [ ] 🟡 Include `timezone` so the backend computes the child's local day correctly

### Download (backend → extension)
- [ ] 🔴 Subscribe to rule and extension-grant changes (Convex subscription, or Supabase Realtime) with **polling fallback**
- [ ] 🔴 Apply changes immediately and re-run evaluation and block sync
- [ ] 🔴 Conflict handling: version/`updatedAt`, last-write-wins; backend is source of truth when online
- [ ] 🟡 Confirm the extension keeps enforcing the last known rules fully offline

### Testing
- [ ] 🔴 Integration tests: offline → online reconciliation, duplicate uploads, clock skew
- [ ] 🔴 E2E: parent changes a limit in the dashboard → extension reflects it within seconds

**DoD (M8):** two real devices sync reliably; going offline never breaks enforcement; no duplicate or lost usage.

---

## Milestone M9: Parent Dashboard (Weeks 5 to 6)

- [ ] 🔴 Next.js app + Tailwind, auth, protected routes
- [ ] 🔴 **Children** management (add/edit/delete child profiles) and device list with last-seen status
- [ ] 🔴 **Live usage** view per child (today, progress vs. limits)
- [ ] 🔴 **Rules management** (same capabilities as local UI: limits, overrides, windows)
- [ ] 🔴 **Grant extra time** action
- [ ] 🟡 **Reports**: daily/weekly/monthly with Recharts (reuse your Taku chart patterns)
- [ ] 🟡 **Requests inbox**: approve/deny child time requests
- [ ] 🟡 **Alerts center**: limit reached, extension offline, requests
- [ ] 🟡 Responsive/mobile-first layout (parents will use phones)
- [ ] 🟡 PWA support (installable on a phone) 🟢 optional
- [ ] 🟡 Accessibility pass and empty/loading/error states
- [ ] 🟡 Data export and delete from the dashboard

**DoD (M9):** a parent can manage everything from their phone without touching the child's computer.

---

## Milestone M10: Notifications and Child Requests (Week 7)

- [ ] 🟡 "Request more time" button on the blocked page (extension → backend → parent)
- [ ] 🟡 Email notifications (Resend or similar): limit reached, time request, extension offline (no heartbeat for X hours), weekly summary
- [ ] 🟡 Web push notifications for requests 🟢 optional
- [ ] 🟡 Notification preferences per parent (frequency, types, quiet hours)
- [ ] 🟡 Throttle/deduplicate alerts to avoid spam
- [ ] 🟡 Child-facing feedback: "Your request was approved/denied"

**DoD (M10):** request-and-approve loop works end to end in under 1 minute.

---

## Milestone M11: Hosted Launch Readiness (Week 8)

### Privacy and legal
- [ ] 🔴 Update the **privacy policy** for cloud data (what is stored, retention, deletion, subprocessors)
- [ ] 🔴 **Legal review** for the Philippine Data Privacy Act (RA 10173) and, if distributed internationally, COPPA/GDPR-K
- [ ] 🔴 Consent flow: explicit parent opt-in to sync; clear disclosure to the child where appropriate
- [ ] 🟡 Data processing documentation (data map, retention schedule)

### Operations
- [ ] 🔴 Production deployment (Vercel for dashboard, managed backend)
- [ ] 🔴 Monitoring and error tracking (Sentry or similar), **excluding** any child-identifying data
- [ ] 🟡 Uptime monitoring (e.g., Uptime Kuma or a hosted equivalent)
- [ ] 🟡 Cost estimate and usage limits (free-tier headroom, abuse prevention)
- [ ] 🟡 Incident/runbook doc and security contact (`SECURITY.md`)
- [ ] 🟡 Security review: dependency audit, auth tests, penetration checklist (OWASP basics)

### Release
- [ ] 🔴 Extension v1.x update with sync (feature remains **opt-in**)
- [ ] 🟡 Update the Web Store listing and **privacy practices disclosure** (permissions/data usage changed)
- [ ] 🟡 Migration path: existing local-only users can link a device without losing history

**DoD (Phase 2):** hosted sync is live, opt-in, reviewed for privacy/security, and local-only mode still works exactly as before.

---

# Phase 3: Expansion

**Goal:** wider reach, more control, and self-hosting for privacy-focused families.

## Milestone M12: Multi-Browser Support

- [ ] 🟡 Audit API differences (Firefox lacks full parity for some MV3 features; check `declarativeNetRequest`, `idle`, and `alarms` behavior)
- [ ] 🟡 Build and test **Edge** (Chromium) officially
- [ ] 🟡 Build and test **Firefox** (WXT multi-browser build, Firefox Add-ons submission)
- [ ] 🟡 Add browser-specific notes to the "make it harder to remove" docs
- [ ] 🟢 Safari (via Xcode converter) evaluate feasibility only

## Milestone M13: Network-Level Integration

- [ ] 🟡 Design a **connector interface** (so integrations are pluggable)
- [ ] 🟡 **AdGuard Home** connector: add/remove blocked domains via its API when limits are reached/reset
- [ ] 🟡 **Pi-hole** connector (API v6 or current version; verify docs)
- [ ] 🟡 Securely store connector credentials; document network requirements (extension must reach the LAN device, or route via the backend/agent)
- [ ] 🟡 Document the trade-offs (blocks all devices on the network, DNS-only so no time measurement)

## Milestone M14: Self-Hosting

- [ ] 🟡 Package the backend + dashboard with **Docker Compose** (one-command start)
- [ ] 🟡 If using Supabase: document the self-hosted stack; if Convex: evaluate its self-hosting option, or consider a simpler open backend (e.g., PostgreSQL + a small API) for the self-hosted edition
- [ ] 🟡 Configurable server URL in the extension (for self-hosted instances)
- [ ] 🟡 HTTPS guidance (reverse proxy with Caddy/Traefik), backup and upgrade docs
- [ ] 🟡 Environment variable reference and a `.env.example`
- [ ] 🟡 CI job that builds and smoke-tests the Docker images

## Milestone M15: Categories and Localization

- [ ] 🟡 Category lists (Social, Video, Games, Adult, Shopping) as open data files in `packages/shared`
- [ ] 🟡 Category-level limits and templates
- [ ] 🟡 Community contribution process for category lists (PR template, validation script)
- [ ] 🟡 Full **i18n**: Filipino (Tagalog) first, then others via community translations
- [ ] 🟡 Translation workflow (e.g., Weblate or simple JSON PRs) and contributor docs

**DoD (Phase 3):** extension runs on Chrome, Edge, and Firefox; at least one network connector works; a family can self-host the full stack following the docs.

---

# Phase 4: Backlog and Future Ideas

- [ ] 🟢 Companion Android app (usage access and app limits), evaluate Flutter/React Native (you have working knowledge of both)
- [ ] 🟢 Usage **anomaly detection** (late-night spikes) reusing your Taku approach
- [ ] 🟢 **Forecasting** ("at this pace, the limit will be reached by 4 PM") using moving average or exponential smoothing
- [ ] 🟢 Reward/chore-based time system (earn extra minutes)
- [ ] 🟢 Focus mode / homework mode (temporary strict profile)
- [ ] 🟢 Per-path rules (e.g., allow `youtube.com/edu`) with privacy review
- [ ] 🟢 Weekly family report (PDF/email) and shareable summaries for teachers
- [ ] 🟢 Plugin API for community extensions

---

# Cross-Cutting Checklists

## Security (review at the end of every milestone)
- [ ] No secrets committed (use `.env`, secret scanning enabled in GitHub)
- [ ] No `eval`, remote code, or inline scripts (MV3 CSP compliant)
- [ ] All user input validated and escaped (domain params, rule inputs, imports)
- [ ] Dependencies up to date, `pnpm audit` clean or exceptions documented
- [ ] Permissions still minimal and documented
- [ ] Backend authorization tests pass (Phase 2+)

## Privacy (review at the end of every milestone)
- [ ] Only domains and durations stored (no URLs, titles, or content)
- [ ] Privacy policy matches the actual behavior of the current version
- [ ] Export and delete features still work
- [ ] No analytics or telemetry that identifies children; any telemetry is opt-in and documented

## Quality gates (every PR)
- [ ] Lint, type-check, and unit tests pass in CI
- [ ] New logic has tests; bug fixes have regression tests
- [ ] Docs and `CHANGELOG.md` updated
- [ ] Manual test on a clean Chrome profile for UI-affecting changes

## Release checklist (every release)
- [ ] All milestone DoD items met
- [ ] Version bumped and tagged; `CHANGELOG.md` updated
- [ ] Migration tested from the previous version (upgrade with existing data)
- [ ] Release zip attached; Web Store/Edge/Firefox submissions updated
- [ ] Announcement drafted

---

# Suggested Weekly Rhythm (Phase 1 example)

| Week | Focus | Key outcome |
|---|---|---|
| 0 | Phase 0 setup | CI green, hello-world extension |
| 1 | M1 Foundation | Types, storage, helpers tested |
| 2 | M2 Tracker (part 1) | Core session tracking working |
| 3 | M2 finish + M3 start | Accuracy test passed; rule engine done |
| 4 | M3 Blocking | Reliable block and reset |
| 5 | M4 PIN + wizard | Secure settings with first-run flow |
| 6 | M4 UI + M5 start | Options page, popup, reports begin |
| 7 | M5 Polish | Reports, export, tamper tests, soak test |
| 8 | M6 Release | Docs, beta feedback, v1.0 |

If a week slips, cut from the 🟢 items first, then 🟡, never from 🔴.

---

# Risk Watchlist (check weekly)

- [ ] Scope creep: is anything in progress not in the current milestone?
- [ ] Is the tracker still accurate after recent changes? (re-run the quick accuracy test)
- [ ] Are service-worker restarts losing data? (check the debug panel after idle periods)
- [ ] Is the Web Store review timeline on track?
- [ ] Is motivation holding? Ship small, release often, and share progress publicly.

---

*Last updated: November 1, 2026 (M1 Foundation complete). Review this plan at the end of each phase and adjust estimates based on actual velocity.*