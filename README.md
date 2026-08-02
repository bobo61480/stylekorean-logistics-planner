# StyleKorean Logistics Planner v2

14-day inbound / outbound operations board for StyleKorean US (Buena Park, CA).
Complete rebuild of the legacy ChatGPT-site planner with **corrected sheet
mappings, per-source resilient sync, honest KPIs, and an authenticated
status-write API**. See [`AUDIT.md`](./AUDIT.md) for everything that was wrong
with the old build — including two **critical security findings you should act
on before deploying anything** (world-editable workbooks and plaintext carrier
credentials).

## Architecture

```
Browser (React/Vite)
  ├─ reads Google Sheets directly (gviz JSON / CSV export)  ← read-only
  └─ /api/*  →  Express server (server/)
                  ├─ GET  /api/sales-kpis   computed KPIs, ~5-min cache
                  ├─ GET  /api/documents    invoice → doc URL map (data/documents.json)
                  └─ POST /api/status       Sheets write via service account
                                            requires X-Planner-Token
```

Key design decisions, each mapped to an audit finding:

| Fix | What changed |
|---|---|
| #1 | `fetchAllSettled` + 12 s per-source timeout — one dead source no longer blanks the board |
| #2 | Inbound rows link via the authoritative `IMPORTS Source Row` column; unmatched rows show an `UNLINKED` chip instead of vanishing |
| #3 | Outbound status reads/writes column **U** (mirror **W** kept in sync) — legacy read the empty column X |
| #4 | Zero hardcoded KPI values; skeletons + `asOf` timestamp + explicit error state |
| #5 | Invoice→document map served from `data/documents.json`, not baked into the bundle |
| #7 | Per-row data patches externalized to `data/corrections.json` with reasons |
| #8 | `OUTBOUND WEBSITE EXCLUSIONS` tab actually applied (fill in its gid, see below) |

## Setup

```bash
npm install
cp .env.example .env        # then edit
```

1. **Google service account** — create one in Google Cloud Console (Sheets API
   enabled), download the JSON key as `service-account.json` (gitignored), and
   share the three workbooks with its `client_email` as **Editor**. Then remove
   "anyone with the link" sharing from the workbooks (AUDIT §S-1).
2. **Operator token** — set `PLANNER_STATUS_TOKEN` in `.env` to a long random
   string and give it to warehouse operators. The board prompts for it once and
   stores it in `sessionStorage`. Writes are refused if the token is unset.
3. **Exclusions gid** — open the master workbook's `OUTBOUND WEBSITE
   EXCLUSIONS` tab and copy the `gid=` from the URL into
   `src/config/sources.js` → `EXCLUSIONS.gid`.

## Run

```bash
npm run server    # API on :8787
npm run dev       # Vite dev server, proxies /api → :8787
```

Production:

```bash
npm run build     # → dist/
npm start         # Express serves dist/ + API on $PORT
```

> **Build status:** this repo was authored in an offline environment —
> `npm install` / `npm run build` have **not** been executed. The code is
> written against React 18 / Vite 5 / Express 4 / googleapis and verified by
> review, but expect the usual first-build shakedown (typos, import paths).
> Run the build before deploying.

## Deploy

Any Node host works (the old ChatGPT-site hosting cannot run the Express
server). Suggested: Cloud Run / Railway / a small VPS. Keep the site off the
public internet if possible (VPN, IP allowlist, or SSO) — the KPI endpoint
returns real revenue figures to anyone who can reach it.

## Repo hygiene

- Never commit `.env` or `service-account.json` (already gitignored).
- `data/corrections.json` entries are temporary — fix the sheet cell, delete the entry.
- New invoice documents: add to `data/documents.json`; no rebuild needed.

## GitHub

Intended home: your existing org setup (`skwarehouse` / `bobo61480`). From this
directory:

```bash
git remote add origin git@github.com:<owner>/stylekorean-logistics-planner.git
git push -u origin main
```
