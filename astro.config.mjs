import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://infusio.pro',
  integrations: [],
  output: 'static', // still allows API routes via /pages/api with Vercel adapter
});