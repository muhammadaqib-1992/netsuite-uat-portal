import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// The build is one self-contained index.html (JS and CSS inlined) so the Suitelet can serve it
// from the File Cabinet without rewriting asset URLs.
// `--mode demo` builds a standalone demo with the in-memory sample data instead of the RESTlet client.
export default defineConfig(({ mode }) => {
  const demo = mode === 'demo';
  return {
    plugins: [react(), viteSingleFile()],
    define: { __DEMO__: JSON.stringify(demo) },
    build: {
      outDir: demo ? 'dist/demo' : '../sdf/src/FileCabinet/SuiteScripts/uat-portal/app',
      emptyOutDir: true,
      chunkSizeWarningLimit: 2000,
    },
  };
});
