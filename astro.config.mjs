// astro.config.mjs
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel'; // <- correct, not "/serverless"

export default defineConfig({
  adapter: vercel(),
  output: 'server',               // needed for API routes
  // …your other options
});