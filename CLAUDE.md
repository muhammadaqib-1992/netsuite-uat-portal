# NetSuite UAT Portal — instructions for Claude

**What this is:** a reusable NetSuite app where client business users execute UAT test cases,
record a status per case, discuss in threaded comments, attach screenshots, and export the Excel
workbook with current statuses at any time. Read `docs/requirements.md` (source of truth) and
`docs/architecture.md` before writing code.

**Client-neutral.** This repo is used on more than one NetSuite project. Never put a client name,
account ID, internal ID, URL or client data in code, config, docs or sample files.

## Stack

- `app/` — React 18 + Vite + TypeScript. SheetJS for Excel. Build output goes to
  `sdf/src/FileCabinet/SuiteScripts/uat-portal/app/` (git-ignored, rebuilt before deploy).
- `sdf/` — SuiteCloud **account customization project**. SuiteScript 2.1 only.
  - Suitelet `customscript_uat_portal_sl` serves the React `index.html`.
  - RESTlet `customscript_uat_api_rl` is the only data API (load/save cases, batched import,
    comments, uploads, export data, email alerts).
  - Scheduled script `customscript_uat_backup_ss` writes nightly snapshots to the File Cabinet.
  - Custom records `customrecord_uat_cycle`, `customrecord_uat_case`, `customrecord_uat_comment`;
    role `customrole_uat_tester`.
- `sample-data/` — dummy workbooks named `sample-*.xlsx`, generic NetSuite flows (order to cash,
  procure to pay, etc.). Invented data only.

## Decisions already made (don't re-ask)

- Status is **per case only**.
- Comments are **threaded**, one reply level; no internal-only comments; no deletes, author can
  edit for 15 minutes.
- Screenshots and email alerts are both in v1, each with an **on/off switch**: account default as a
  RESTlet script parameter, overridable per UAT Cycle. The API enforces the switch.
- Module/cycle sign-off is deferred (D6 open).

## Rules

- Reference every record, field, script and role by **script ID**, never internal ID.
- Account-specific values are script parameters, never hard-coded.
- Every save checks last-modified to prevent silent overwrites; imports are batched (~50 rows per
  call) and check remaining governance.
- Claude writes code and SDF objects; **the user runs `suitecloud project:deploy`**. Don't deploy,
  and don't set up SuiteCloud authentication with the user's credentials.
- Log each deployment in `docs/deployments.md`; tag releases `vX.Y.Z`.
- Commit only when the user asks.
