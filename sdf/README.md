# sdf — SuiteCloud project

Account customization project, SuiteScript 2.1.

| Object | Script ID |
|---|---|
| UAT Cycle | `customrecord_f3u_uat_cycle` |
| UAT Test Case | `customrecord_f3u_uat_case` |
| UAT Comment | `customrecord_f3u_uat_comment` |
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
| `custscript_f3u_uat_team_employees` | RESTlet | blank | Employees who import workbooks and manage cycles |
| `custscript_f3u_uat_lead_employees` | RESTlet | blank | Employees who see the dashboard |
| `custscript_f3u_uat_team_roles` | RESTlet | `administrator` | Optional: role script IDs whose users count as implementation team |
| `custscript_f3u_uat_lead_roles` | RESTlet | blank | Optional: role script IDs whose users count as UAT leads |
| `custscript_f3u_uat_data_folder` | RESTlet | blank | Folder for evidence, workbooks, templates, backups; blank = top-level "F3U UAT Portal Data" |
| `custscript_f3u_uat_bk_data_folder` | Backup | blank | Same folder as above |
| `custscript_f3u_uat_app_path` | Suitelet | `SuiteScripts/f3u_uat_portal/app/index.html` | Where the built app lives |

No custom role is shipped. The Suitelet and RESTlet deployments are released to all internal roles
and the custom records need no permission, so employees use the portal with the role they already
have. The RESTlet decides who is implementation team, UAT lead or tester from the parameters above.
Screenshot upload and viewing go through N/file as the signed-in user; if a tester's role cannot
save files, check Documents and Files access for that role during the first test.

## Deploy (run by you, not Claude)

```bash
cd app && npm run build && cd ../sdf
suitecloud account:setup
suitecloud project:validate --server
suitecloud project:deploy
```
Then set the parameters above (at least the implementation team employees), open the Suitelet's URL, and log the
deployment in `../docs/deployments.md`.
