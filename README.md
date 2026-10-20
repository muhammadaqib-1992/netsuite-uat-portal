# NetSuite UAT Portal

A web app that runs inside a NetSuite account and lets client business users execute UAT test cases,
record results, discuss issues in comments, and export the full Excel workbook with current statuses
at any time. It replaces sharing a UAT spreadsheet back and forth.

Built to be **reusable across NetSuite projects**: nothing in this repo is specific to one client.
Client-specific values are set per account through script parameters after deployment.

> **Status:** v0.1 code complete, not yet deployed to a NetSuite account. Sign-off (R20, D6) and
> Jira defect creation (R26) are not built. See [docs/requirements.md](docs/requirements.md).

## How it works

```
Browser ── React app (served by a Suitelet) ── RESTlet API ── UAT custom records
                     │                                          File Cabinet (evidence, backups)
                     └── Excel import/export in the browser (SheetJS)
```

Full design: [docs/architecture.md](docs/architecture.md).

## Repo layout

| Folder | Holds |
|---|---|
| `app/` | React + Vite + TypeScript front end. The build is written into the SDF project's File Cabinet folder. |
| `sdf/` | SuiteCloud account customization project: custom records, role, scripts and deployments. |
| `sample-data/` | Dummy UAT workbooks for testing. **No client data, ever.** |
| `docs/` | Requirements, architecture, deployment runbook, deployment log. |

## Deployment flow

1. **Test account** (developer or demo account) — dummy data only.
2. **Client sandbox** — pilot with 1–2 client users.
3. **Client production** (or the sandbox agreed with the client).

Each target account gets its own SuiteCloud authentication. Always run
`suitecloud project:validate --server` against the target before `suitecloud project:deploy`, and
record every deployment in [docs/deployments.md](docs/deployments.md). To remove the portal from an account, follow
[docs/uninstall.md](docs/uninstall.md).

## Rules

- Reference records, fields, scripts and roles by **script ID**, never by internal ID.
- Every NetSuite object ID, script file and folder starts with **`f3u_uat`**, so the portal's objects
  are easy to find and remove.
- No hard-coded account values. Anything that differs per account is a script parameter.
- Only dummy data in non-client accounts. Client workbooks never leave the client's account.
- Tag every release (`v0.1.0`, ...) and log which version is installed where.
