# app — React front end

React 18 + Vite 8 + TypeScript 7, SheetJS for Excel. Needs Node 20.19+ or 22.12+.

```bash
npm install
npm run dev          # http://localhost:5173 with an in-memory mock API (no NetSuite needed)
npm run build        # typecheck + build into the SDF File Cabinet folder
npm run demo         # http://localhost:4174: standalone demo with sample cycles; "View as" switches tester/lead/team
npm run serve:build  # http://localhost:4173: the production build, served like the Suitelet, with a mock RESTlet
npm run test:excel   # import → export → re-import checks on the sample workbooks
npm run samples      # regenerate ../sample-data/sample-*.xlsx
```

In dev mode add `?level=tester` or `?level=lead` to the URL to see the app as that access level.

## Build output

`npm run build` writes a single self-contained `index.html` (JS and CSS inlined) to
`../sdf/src/FileCabinet/SuiteScripts/f3u_uat_portal/app/` (git-ignored). The Suitelet serves that file and
replaces the `<!--UAT_CONFIG-->` comment with the RESTlet URL. Rebuild before every deploy.

## Layout

| Path | Holds |
|---|---|
| `src/api/api.ts` | `Api` interface and the RESTlet client (session cookies, `{ ok, data }` envelope) |
| `src/api/mock.ts` | Dev-only mock with the same rules as the RESTlet; never in the production build |
| `src/lib/excel.ts` | Column auto-mapping, validation, row extraction, export in the original layout |
| `src/components/` | Case list and filters, case detail and result form, threaded comments, dashboard, import wizard, cycle settings |

## Export

Import reads with SheetJS. It recognises common column names, skips section heading rows (a label in
the Case ID column and nothing else), and can import every sheet that shares one layout as a single
cycle (Case IDs become `<sheet> <No.>`, Module can come from the sheet name). Status words are
translated per cycle; the defaults come from the workbook's Results dropdown.

Export uses ExcelJS to write results into the original workbook stored at import, cell by cell, so
styling, dropdowns, merged cells, section rows, other sheets and formulas are kept (formulas
recalculate when the file opens). It writes statuses in the workbook's own words, fills the mapped
Comments column (or adds `Latest Comment`), adds a `Comments` sheet and a hidden `_uat_portal` sheet
with the cycle ID. Re-importing that file updates the same cycle. Without a stored original it builds
a plain workbook with the same columns.
