# Requirements — NetSuite UAT Portal

Version 0.4 · decisions D1–D5, D7–D11 recorded · 2026-10-20

## 1. Problem

UAT test cases are shared with the client as an Excel file and statuses are marked directly in it.
This causes overwritten cells, columns that drift out of format, no live view of progress, and no
reliable record of who changed what or why.

## 2. Goal

A web app inside the client's NetSuite account where testers execute UAT cases, record results and
comment, while **Excel stays the hand-off format**: a workbook can be imported, and exported in the
same layout with current statuses, at any time.

Must be reusable across NetSuite projects without code changes.

## 3. Users and access levels

| Access level | Can |
|---|---|
| **Tester** (client business user) | View assigned/all cases in a cycle, set status, enter actual result, comment, attach evidence, export |
| **UAT Lead** (client) | Everything a tester can, plus view the dashboard and sign off a module or cycle |
| **Implementation team** (QA / consultant) | Everything, plus import workbooks, manage cycles and their screenshot/email switches |

Users are employees who sign in with their own NetSuite login and their existing role; the project
ships **no role** (decided D11). The custom records need no special permission, so any role can use
the portal. The implementation team and UAT leads are chosen by employee on the RESTlet deployment
(`custscript_f3u_uat_team_employees`, `custscript_f3u_uat_lead_employees`), or optionally by role
script ID; everyone else is a tester. The RESTlet enforces these levels.

## 4. Functional requirements

### Import
- **R1** Upload a `.xlsx` UAT workbook; the app reads the columns from the header row.
- **R2** Column mapping: auto-detect common columns (Case ID, Module, Scenario, Pre-conditions,
  Steps, Expected Result, Status, ...) and let the user remap them. Save the mapping as a template.
- **R3** Validate before saving: duplicate Case IDs, missing required columns, empty steps.
- **R4** Keep every original column and sheet (original row stored as JSON) so the export comes back
  in the same layout.
- **R5** Import creates one **UAT Cycle** and one **UAT Test Case** per row, saved in batches
  (about 50 rows per request) to stay inside NetSuite governance limits.
- **R5a** A workbook may split cases across several sheets with the same columns (often one per
  module, plus a summary sheet). Those sheets import together as one cycle; Case IDs are prefixed with
  the sheet name and Module can come from the sheet name. Section heading rows are skipped.
- **R5b** Each cycle stores the workbook's own status words (read from its Results dropdown where
  there is one) and translates them on import and export.

### Execution
- **R6** Case list with filters (module, status, tester) and search.
- **R7** Case detail: steps, expected result, pre-conditions and test data.
- **R8** Per case record: Status (Not Started / In Progress / Pass / Fail / Retest / Blocked / N/A),
  Actual Result, Tester (logged-in user, automatic), Executed On (automatic), Defect Ref.
- **R9** Fail or Blocked requires an Actual Result and a reason; the reason is posted as a comment.
- **R10** Status is recorded **per case only** (decided D1). Steps are display text.
- **R11** Save checks the record's last-modified time. If someone else saved first, the user is
  asked to reload instead of overwriting.

### Comments
- **R12** Comment thread on each test case, stored as **UAT Comment** records (one per comment).
- **R13** Each comment records author and time automatically; types: General / Clarification /
  Fail Reason / Retest Note / Resolution.
- **R14** Authors can edit their own comment for 15 minutes; nobody can delete. Edits are kept in
  System Notes.
- **R15** No internal-only comments (decided D3): every comment is visible to every portal user.
- **R16** **Threaded** comments (decided D2): a comment can reply to another; replies show indented
  under their parent, one level deep.
- **R17** Screenshot attachments on a comment or on the case result, stored in the File Cabinet
  (decided D4). **Can be switched on or off** (see R27).
- **R18** Case list shows a comment count and a filter for cases with unanswered client comments.

### Progress
- **R19** Dashboard: totals by status and module, % executed, % passed, open Fail and Blocked cases.
- **R20** *(Open)* Sign-off per module or cycle by the UAT Lead (name and date).

### Export
- **R21** Export at any time to `.xlsx` in the original layout with status columns updated. Results
  are written into the original file in place, keeping its styling, dropdowns, merged cells and
  formulas.
- **R22** Main sheet gets a "Latest Comment" column; a new **Comments** sheet lists every comment
  (Case ID, Comment ID, Reply To, Author, Date, Type, Comment, Attachment name).
- **R23** Re-importing an exported workbook updates the same cycle without data loss.

### Backup
- **R24** Scheduled script writes a nightly Excel/CSV snapshot of each active cycle to the File
  Cabinet, so results survive a sandbox refresh.

### Notifications
- **R25** Email alert when a case is set to Fail or Blocked, and when someone comments on a case
  (sent to the case's tester and the cycle's owner). **Can be switched on or off** (decided D5, see R27).

### Feature switches
- **R27** Screenshots and email alerts each have an on/off switch:
  - **Account default:** checkbox script parameters on the RESTlet deployment
    (`custscript_f3u_uat_enable_screenshots`, `custscript_f3u_uat_enable_email`), set by the NetSuite admin.
  - **Per cycle:** matching checkboxes on the UAT Cycle, editable by the implementation team in the
    portal; a new cycle copies the account default.
  - When screenshots are off the upload control is hidden and the API rejects uploads. When email is
    off no alert is sent.

### Later
- **R26** Create a Jira defect from a failed case (v1 stores the defect reference only).

## 5. Non-functional requirements

- **NF1** Runs entirely inside the NetSuite account; no external hosting or database.
- **NF2** Isolated: only its own `customrecord_f3u_uat_*` records and its own scripts. No scripts or
  workflows on standard records, so it cannot affect the system under test.
- **NF3** Portable: everything referenced by script ID; account-specific values are script
  parameters; installs on any account with the required features.
- **NF4** Removable: every object carries the `f3u_uat` prefix and the project can be removed after results are exported (steps in `docs/uninstall.md`).
- **NF5** Works in current Chrome and Edge; usable by non-technical business users.
- **NF6** Handles cycles of up to a few thousand cases.

## 6. Required account features

Custom Records · Server SuiteScript · Client SuiteScript · SuiteCloud Development Framework ·
Token-Based Authentication (for SDF deployment).

## 7. Open decisions

| # | Decision | Outcome | Status |
|---|---|---|---|
| D1 | Status per step? | **Per case only** | Decided 2026-10-19 |
| D2 | Comment layout | **Threaded** | Decided 2026-10-19 |
| D3 | Internal-only comments | **No** | Decided 2026-10-19 |
| D4 | Screenshot attachments in v1 | **Yes, with on/off switch** | Decided 2026-10-19 |
| D5 | Email alerts in v1 | **Yes, with on/off switch** | Decided 2026-10-19 |
| D6 | Module / cycle sign-off in v1 | Later (default) | Open |
| D7 | Test account | All required features enabled | Decided 2026-10-19 |
| D8 | Sample UAT workbook | Build a dummy workbook in `sample-data/` | Decided 2026-10-19 |
| D9 | Statuses beyond the first six | **Add Retest** (a fix is ready to test again). Other workbook words map to the seven statuses per cycle; Required Discussion maps to Blocked | Decided 2026-10-19 |
| D10 | Case title when a layout has both Scenario and Step Name | **Step Name** is the case title; Scenario is kept as an extra column | Decided 2026-10-19 |
| D11 | Custom role for testers | **None.** Employees use their existing roles; records need no permission; team and leads are picked by employee | Decided 2026-10-20 |
