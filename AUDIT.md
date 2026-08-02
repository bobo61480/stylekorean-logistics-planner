# Audit — StyleKorean Logistics Planner (legacy ChatGPT-site build)

**Audited:** 2026-08-01 · **Auditor:** Claude (with Alex)
**Subject:** `stylekorean-logistics-planner.alex481942.chatgpt.site` — bundled Vite/React app, all logic in `assets/page-BlNKOZcH.js` (~65 KB), reverse-engineered from the deployed bundle and verified cell-by-cell against the live Google Sheets responses (gviz JSON + CSV exports).

Every finding below was confirmed against live data, not inferred from code alone. Fix IDs (`FIX #n`) are cross-referenced in the new codebase's comments.

---

## 1 · Data sources (verified)

| Source | Workbook / gid | Fetch | Range |
|---|---|---|---|
| Inbound (linked) | LOGISTICS MASTER 2026 · gid `2026070701` INBOUND SHIPMENTS DATA | gviz | `A3:S1200` |
| Imports (authoritative) | master · gid `1497250700` IMPORTS | CSV | full |
| Outbound schedule | master · gid `20260708` Outbound Shipping Schedule | CSV | headers row 3, data row 4 |
| Nationals sales | NATIONAL/IHERB/MBX · gid `99300389` | gviz | `A1:U3500` |
| WMS sales | WMS PROMOTION · gid `0` (Stylekorean) | gviz | `A2:AF4200` |
| Sales KPIs | `/api/sales-kpis` (server) | JSON | — |
| Status writes | `/api/status` (server) | POST | — |

Auto-refresh every 30 minutes.

---

## 2 · Functional bugs

### M-1 · One slow source blanks the whole board — FIX #1
All six data sources were fetched in a single `Promise.all` with **no timeout**. Any one failure/stall (the `/api/sales-kpis` endpoint was observed pending > 10 s) rejected the whole chain: every KPI rendered `0`, every panel showed "SYNCING…". This is why the live site displays all zeros.
**Fix:** `fetchAllSettled` — per-source isolation, 12 s timeout per source, per-source error chips in the sync strip; healthy panels keep rendering.

### M-2 · Inbound rows silently dropped; authoritative link column ignored — FIX #2
`INBOUND SHIPMENTS DATA` column **R (idx 17, "IMPORTS Source Row")** carries the authoritative pointer to the IMPORTS row. The legacy client ignored it and fuzzy-matched on shipment #/invoice/MBL/HBL instead; when a match wasn't unique the row was **silently dropped from the board** (verified: 120 live data rows, several non-unique keys).
**Fix:** use col 17 first, fall back to keyed matching, and keep unmatched rows on the board flagged `UNLINKED` instead of hiding them.

### M-3 · Outbound status read from the wrong column (off-by-one) — FIX #3
Verified layout: STATUS = **U (idx 20)**, unlabeled website mirror = **W (idx 22)**. The legacy client read the mirror at **idx 23 (X — empty)** and only worked because of a fallback to idx 20. The write-confirmation path had the same bug (read `U:X`, preferred X), so confirmations passed vacuously.
**Fix:** U is authoritative, W is the mirror; the server writes both, and the client confirms by re-reading U (and IMPORTS `AD`) directly.

### M-4 · Stale hardcoded KPIs shown as live data — FIX #4
The bundle contained baked-in fallback values (nationals MTD `2,209,375.46`, YTD `6,244,884.52`; WMS MTD `3,601,652.95`, YTD `15,591,074.08`) rendered with no "stale" indicator whenever the KPI endpoint was slow — which was most of the time (see M-1). Real endpoint values differed materially (e.g. WMS YTD `15,626,642.64`, both MTD values `0`).
**Fix:** no fallback numbers exist anywhere in the client. Skeletons (—) until the server responds, with an `asOf` timestamp on every KPI panel and an explicit error banner on failure. Server computes KPIs per the documented methodology (Nationals: Amount col E / Order Date col G, CXL rows excluded; WMS: Date col A / Invoice Amount col G; shipping & mix from the Outbound schedule).

### M-5 · Hundreds of invoice→Drive-ID mappings baked into the public bundle — FIX #5
Required a code rebuild for every new invoice and leaked internal Drive file IDs to the public internet (see also S-4).
**Fix:** map moved to server-side `data/documents.json`, served by `GET /api/documents`; unknown invoices fall back to a Drive search link.

### M-6 · Per-row data hacks buried in code — FIX #7
Regex rewriting invoice `N00451013 → IN00451013` for shipment OSL10, and forcing `JSL260726/7` to Air mode, lived inline in the bundle.
**Fix:** externalized to `data/corrections.json`, each entry with a documented reason and an instruction to fix the sheet cell and delete the entry.

### M-7 · Exclusions tab never applied + tab-name mismatch — FIX #8
The master's `OUTBOUND WEBSITE EXCLUSIONS` tab is never read by the legacy client, and its SOURCE column references `B2B/E-COM TRUCKING` while the actual tab is `B2BE-COM TRUCKING` (no slash).
**Fix:** exclusions parser added (filters by normalized KEY, tolerant of the name mismatch). **TODO for Alex:** fill in the tab's `gid` in `src/config/sources.js` (`EXCLUSIONS.gid`) — it couldn't be confirmed remotely.

### Verified-correct mappings (no change needed)
IMPORTS: SHIPMENT A / INVOICE C / MBL D / HBL E / CONTAINER H / VSL O / status AD. Nationals: Status A, Channel B, Dept C, PO# D, Amount E, Order Date G, SSD H, CXL I, Pickup J, Ship Via L, Remark M. WMS Stylekorean (headers row 2): Date A, Invoice# B, Customer C, Sales D, Ship-out E, Shipping Method F, Invoice Amount G, Issue H.

---

## 3 · Security findings — **act on these first**

### S-1 · CRITICAL — All three workbooks are world-editable
Verified via Drive permissions: **LOGISTICS MASTER 2026, NATIONAL/IHERB/MBX, and WMS PROMOTION are all shared "anyone with the link — Editor."** The links are printed on the fully public website. Anyone on the internet can read *and modify* the master logistics data and sales figures.
**Remediation (do in this order):**
1. On each workbook: Share → General access → change to **Restricted** (or domain-only, **Viewer**).
2. Create a Google Cloud **service account**; share each workbook with its `client_email` as Editor.
3. Point the new server at the key file (`GOOGLE_SERVICE_ACCOUNT_KEY_FILE`) — reads and status writes then work without public sharing.

### S-2 · CRITICAL — Plaintext credentials inside synced workbooks
- Master workbook `LOGIN` tab and Nationals `loginfo` tab: **carrier account credentials in plaintext** (UPS, FedEx, etc.).
- WMS workbook `Sheet7`: **Wi-Fi passwords.**
Combined with S-1, these credentials are effectively public. **Rotate every credential in those tabs now**, move them to a password manager, and delete the tabs from any workbook that syncs to a website.

### S-3 · HIGH — Unauthenticated write endpoint & open financials
Legacy `/api/status` accepted writes with no authentication; `/api/sales-kpis` returned real revenue figures to anyone. **Fix in new build:** `/api/status` requires an `X-Planner-Token` shared operator token (refuses all writes if unset); consider putting the whole site behind SSO/VPN since KPIs remain readable by anyone who can load the page.

### S-4 · MEDIUM — Internal identifiers leaked in the public bundle
Invoice numbers and Drive file IDs shipped in the client JS (see M-5). Fixed by moving the map server-side. Note: old bundle remains in ChatGPT-site hosting history until that deployment is deleted.

### S-5 · LOW — Site indexed/indexable
Internal operations tool with no `robots` restriction. New build ships `noindex, nofollow` meta + `X-Robots-Tag` header. Prefer network-level protection (VPN / IP allowlist / SSO).

---

## 4 · Post-migration checklist

- [ ] Rotate all carrier + Wi-Fi credentials (S-2), delete `LOGIN` / `loginfo` / `Sheet7` secrets tabs
- [ ] Restrict sharing on all three workbooks; add service account (S-1)
- [ ] Set `PLANNER_STATUS_TOKEN` and distribute to operators (S-3)
- [ ] Fill in `EXCLUSIONS.gid` in `src/config/sources.js` (M-7)
- [ ] Fix the OSL10 invoice typo + JSL26072x AIR markers in the sheets, then empty `data/corrections.json` (M-6)
- [ ] Populate `data/documents.json` with current invoice→doc links (M-5)
- [ ] Take down / delete the old chatgpt.site deployment (S-4)
- [ ] `npm install && npm run build` (not run during this audit — container had no network access)
