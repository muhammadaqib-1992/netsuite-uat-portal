# sdf — SuiteCloud project

Account customization project, SuiteScript 2.1.

| Object | Script ID |
|---|---|
| UAT Cycle | `customrecord_f3u_uat_cycle` |
| UAT Test Case | `customrecord_f3u_uat_case` |
| UAT Comment | `customrecord_f3u_uat_comment` |
| UAT Tester role | `customrole_f3u_uat_tester` (View cycles, Edit cases and comments, Documents and Files: Edit) |
| Suitelet (portal page) | `customscript_f3u_uat_portal_sl` / `customdeploy_f3u_uat_portal_sl` |
| RESTlet (data API) | `customscript_f3u_uat_api_rl` / `customdeploy_f3u_uat_api_rl` |
| Nightly backup | `customscript_f3u_uat_backup_ss` / `customdeploy_f3u_uat_backup_ss` (daily 02:00) |

Script files are in `src/FileCabinet/SuiteScripts/f3u_uat_portal/`; `f3u_uat_lib.js` holds the shared record and
field IDs. The built React app goes into `.../uat-portal/app/` (git-ignored).

## Script parameters (set per account after deploy)

| Parameter | On | Default | Meaning |
|---|---|---|---|
| `custscript_f3u_uat_enable_screenshots` | RESTlet | on | Copied to each new cycle |
| `custscript_f3u_uat_enable_email` | RESTlet | off | Copied to each new cycle |
| `custscript_f3u_uat_team_roles` | RESTlet | `administrator` | Role script IDs (comma-separated) that import and manage cycles |
| `custscript_f3u_uat_lead_roles` | RESTlet | blank | Role script IDs that see the dashboard |
| `custscript_f3u_uat_data_folder` | RESTlet | blank | Folder for evidence, workbooks, templates, backups; blank = top-level "F3U UAT Portal Data" |
| `custscript_f3u_uat_bk_data_folder` | Backup | blank | Same folder as above |
| `custscript_f3u_uat_app_path` | Suitelet | `SuiteScripts/f3u_uat_portal/app/index.html` | Where the built app lives |

The Suitelet and RESTlet deployments are released to all roles; data access is controlled by the
custom record permissions and the role checks in the RESTlet.

## Deploy (run by you, not Claude)

```bash
cd app && npm run build && cd ../sdf
suitecloud account:setup
suitecloud project:validate --server
suitecloud project:deploy
```
Then give testers the UAT Tester role, set the parameters above, open the Suitelet's URL, and log the
deployment in `../docs/deployments.md`.
