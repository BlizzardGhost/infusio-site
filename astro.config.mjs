// astro.config.mjs
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel'; // ✅ new import

export default defineConfig({
  output: 'server',            // ✅ was "hybrid" (invalid)
  adapter: vercel(),           // default is Node runtime on Vercel
  // If you want Edge runtime instead, use: vercel({ runtime: 'edge' })
});