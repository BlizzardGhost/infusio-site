import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel/serverless'; // or /edge if you prefer

export default defineConfig({
  output: 'hybrid',          // enables API routes
  adapter: vercel(),
});