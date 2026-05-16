import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

export default defineConfig({
  site: 'https://drenther.github.io',
  base: '/izod/',
  integrations: [react()],
});
