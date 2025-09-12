// astro.config.mjs
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

import sitemap from '@astrojs/sitemap';

export default defineConfig({
  adapter: vercel(),
  output: 'server',

  i18n: {
    locales: ['en', 'es'],
    defaultLocale: 'en',
    routing: {
      // Keep "/" for default locale (EN), prefix only non-default locales.
      prefixDefaultLocale: false
    }
  },

  integrations: [sitemap()]
});