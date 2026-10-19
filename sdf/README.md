# sdf — SuiteCloud project

Account customization project. Not scaffolded yet.

Will hold:
- `src/Objects/` — custom records (`customrecord_uat_*`), role (`customrole_uat_tester`),
  scripts and deployments (Suitelet, RESTlet, scheduled backup).
- `src/FileCabinet/SuiteScripts/uat-portal/` — SuiteScript 2.1 files and the built React app.

Per-account deploy:
```bash
suitecloud account:setup
suitecloud project:validate --server
suitecloud project:deploy
```
Log each deployment in `../docs/deployments.md`.
