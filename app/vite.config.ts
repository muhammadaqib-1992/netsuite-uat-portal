import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// The build is one self-contained index.html (JS and CSS inlined) so the Suitelet can serve it
// from the File Cabinet without rewriting asset URLs.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: {
    outDir: '../sdf/src/FileCabinet/SuiteScripts/uat-portal/app',
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
  },
});
