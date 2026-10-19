# app — React front end

React 18 + Vite 8 + TypeScript 7, SheetJS for Excel. Needs Node 20.19+ or 22.12+.

```bash
npm install
npm run dev          # http://localhost:5173 with an in-memory mock API (no NetSuite needed)
npm run build        # typecheck + build into the SDF File Cabinet folder
npm run test:excel   # import → export → re-import checks on the sample workbooks
npm run samples      # regenerate ../sample-data/sample-*.xlsx
```

In dev mode add `?level=tester` or `?level=lead` to the URL to see the app as that access level.

## Build output

`npm run build` writes a single self-contained `index.html` (JS and CSS inlined) to
`../sdf/src/FileCabinet/SuiteScripts/uat-portal/app/` (git-ignored). The Suitelet serves that file and
replaces the `<!--UAT_CONFIG-->` comment with the RESTlet URL. Rebuild before every deploy.

## Layout

| Path | Holds |
|---|---|
| `src/api/api.ts` | `Api` interface and the RESTlet client (session cookies, `{ ok, data }` envelope) |
| `src/api/mock.ts` | Dev-only mock with the same rules as the RESTlet; never in the production build |
| `src/lib/excel.ts` | Column auto-mapping, validation, row extraction, export in the original layout |
| `src/components/` | Case list and filters, case detail and result form, threaded comments, dashboard, import wizard, cycle settings |

## Export

The export starts from the original workbook stored at import (so other sheets and title rows are
kept), rewrites the cases sheet from portal data, adds `Status`/`Actual Result` columns if the workbook
had none, a `Latest Comment` column, a `Comments` sheet, and a hidden `_uat_portal` sheet with the cycle
ID. Re-importing that file updates the same cycle. SheetJS Community Edition does not keep cell
styling (fonts, fills); values, other sheets, column widths and title-row merges are kept.
