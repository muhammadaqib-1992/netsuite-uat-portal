/**
 * Serves the UAT portal React app (a single self-contained index.html built by Vite)
 * and tells it where the data API lives.
 *
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 */
define(['N/file', 'N/url', 'N/runtime'], (file, url, runtime) => {
  const DEFAULT_APP_PATH = 'SuiteScripts/uat-portal/app/index.html';
  const PLACEHOLDER = '<!--UAT_CONFIG-->';

  function onRequest(ctx) {
    const appPath = runtime.getCurrentScript().getParameter({ name: 'custscript_uat_app_path' }) || DEFAULT_APP_PATH;
    let html;
    try {
      html = file.load({ id: appPath }).getContents();
    } catch (e) {
      ctx.response.write(
        `<p>The UAT portal app was not found at <code>${appPath}</code>. Build the app and deploy the SDF project again.</p>`
      );
      return;
    }
    const config = {
      apiUrl: url.resolveScript({ scriptId: 'customscript_uat_api_rl', deploymentId: 'customdeploy_uat_api_rl' }),
    };
    // Escape "<" so the JSON cannot close the script tag.
    const json = JSON.stringify(config).replace(/</g, '\\u003c');
    ctx.response.setHeader({ name: 'Content-Type', value: 'text/html; charset=utf-8' });
    ctx.response.write(html.replace(PLACEHOLDER, `<script>window.__UAT_CONFIG__=${json};</script>`));
  }

  return { onRequest };
});
