# Architecture — NetSuite UAT Portal

Proposal pages (private; share from each page's Share menu):

- NetSuite option (chosen): https://claude.ai/artifact/6VHMf5t7RWGR2VT8QMWSPf
- Google Apps Script option (not chosen): https://claude.ai/artifact/5DvdEX52mxd5UbbvEfiTQN
- Side-by-side comparison: https://claude.ai/artifact/Lecss91Gbxm8ajHgVVh8Hw

## Components

| Component | Technology | Purpose |
|---|---|---|
| Portal | Suitelet serving a React app (Vite build in the File Cabinet) | Screens for testers, leads and the implementation team |
| API | SuiteScript 2.1 RESTlet | Load/save, batched import, conflict check, comments, role checks |
| Data | Custom records | UAT Cycle, UAT Test Case, UAT Comment |
| Email | `N/email` from the RESTlet | Fail/Blocked and new-comment alerts, when switched on |
| Files | File Cabinet | App bundle, evidence screenshots, nightly backups |
| Excel | SheetJS in the browser | Import and export in the client's own layout |
| Backup | Scheduled SuiteScript | Nightly snapshot of active cycles |
| Audit | System Notes | Who changed what and when |

## Data model (draft)

| Record | Script ID | Key fields |
|---|---|---|
| UAT Cycle | `customrecord_uat_cycle` | name, environment, start/end date, status, owner, source file, column mapping (JSON), screenshots enabled, email alerts enabled |
| UAT Test Case | `customrecord_uat_case` | cycle, case ID, module, scenario, pre-conditions, steps, expected result, status, actual result, tester, executed on, defect ref, evidence file, original row (JSON) |
| UAT Comment | `customrecord_uat_comment` | case, text, author, posted on, type, reply to (parent comment, one level), attachment, status at time |

Status is per case only (no step-result record). Field IDs are finalised with the sample workbook.

## Feature switches

| Switch | Account default (script parameter on the RESTlet deployment) | Per cycle (UAT Cycle checkbox) |
|---|---|---|
| Screenshots | `custscript_uat_enable_screenshots` | `custrecord_uat_cycle_screenshots` |
| Email alerts | `custscript_uat_enable_email` | `custrecord_uat_cycle_email` |

A new cycle copies the account default. The API enforces the switch, not just the UI.

## Implementation notes (v0.1)

- **Field IDs** are defined in `sdf/src/FileCabinet/SuiteScripts/uat-portal/uat_lib.js` and the
  `sdf/src/Objects/customrecord_uat_*.xml` files. Statuses and comment types are text fields validated
  by the API (no custom lists, so nothing depends on list-value internal IDs).
- **Conflict check (R11):** each case has a `custrecord_uat_case_version` counter. The app sends the
  version it loaded; the RESTlet rejects the save with `CONFLICT` if it changed, then increments it.
  Optimistic locking is also on for all three record types.
- **Who is who:** access level comes from the user's role script ID matched against the RESTlet
  parameters `custscript_uat_team_roles` and `custscript_uat_lead_roles`; everyone else is a tester.
- **Unanswered comments (R18):** a top-level comment by a non-team user with no reply from the team.
- **Re-import (R23):** cases match by Case ID within the cycle. Descriptive fields update; a status or
  result from the workbook is only applied when the portal case is still Not Started.
- **Files:** evidence, original workbooks, mapping templates and backups live in a "UAT Portal Data"
  folder (or the folder in `custscript_uat_data_folder`). The app reads images through the API, so
  testers never need direct File Cabinet URLs.
- **Backup (R24):** CSV (cases + comments) per Active cycle per night; reschedules itself if
  governance runs low.
