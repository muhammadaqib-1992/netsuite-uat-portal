# Removing the UAT portal from an account

Everything the portal adds to NetSuite carries the prefix **`f3u_uat`**. It changes nothing on
standard records (no scripts, workflows or fields on them) and ships no role, so employees' roles and
access are untouched. Removing it means deleting the objects
below, in this order. SDF has no uninstall command for account customization projects, so this is
done in the NetSuite UI by an administrator.

## What is installed

| Kind | Script ID / path | Where to find it |
|---|---|---|
| Custom record | `customrecord_f3u_uat_comment` | Customization > Lists, Records, & Fields > Record Types |
| Custom record | `customrecord_f3u_uat_case` | same |
| Custom record | `customrecord_f3u_uat_cycle` | same |
| Suitelet | `customscript_f3u_uat_portal_sl` + `customdeploy_f3u_uat_portal_sl` | Customization > Scripting > Scripts |
| RESTlet | `customscript_f3u_uat_api_rl` + `customdeploy_f3u_uat_api_rl` | same |
| Scheduled script | `customscript_f3u_uat_backup_ss` + `customdeploy_f3u_uat_backup_ss` | same |
| Script files and app | `SuiteScripts/f3u_uat_portal/` | Documents > Files > File Cabinet |
| Data folder (created on first use) | `F3U UAT Portal Data/` with Evidence, Workbooks, Backups, or the folder set in `custscript_f3u_uat_data_folder` | same |

All custom fields (`custrecord_f3u_uat_…`) belong to the three record types and go with them. Script
parameters (`custscript_f3u_uat_…`) go with their scripts.

## Steps

1. **Keep the results.** In the portal, export every cycle to Excel. Download the
   `F3U UAT Portal Data/Backups` folder too if you want the nightly CSV snapshots.
2. **Stop the nightly backup.** Open `customdeploy_f3u_uat_backup_ss` and set Status to Not Scheduled,
   so it cannot run during removal.
3. **Delete the three scripts.** For each script above, delete its deployment first, then the script.
4. **Delete the custom record types, children first:** UAT Comment, then UAT Test Case, then UAT
   Cycle. Deleting a record type deletes its fields and its records. If NetSuite says a type is in use,
   it lists what uses it (for example a saved search someone created); delete that first and retry.
5. **Delete the files.** In the File Cabinet, delete `SuiteScripts/f3u_uat_portal` and
   `F3U UAT Portal Data` (or the folder named in the data folder parameter).
6. **Check nothing is left.** Search `f3u_uat` in Customization > Scripting > Scripts, in Record Types
   and in the File Cabinet. Nothing should be listed.

Record the removal in [deployments.md](deployments.md).

## One-click removal next time

If a client wants removal to be a single step, install the portal as a **SuiteBundle** instead of
deploying the SDF project directly: build a bundle with the objects above in the account where the
project is deployed, install it in the target account, and later uninstall it from Customization >
SuiteBundler > Search & Install Bundles > List. The bundle route needs a source account to publish
from; direct SDF deployment does not.
