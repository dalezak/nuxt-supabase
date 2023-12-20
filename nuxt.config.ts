// https://nuxt.com/docs/api/configuration/nuxt-config
import packageJson from './package.json';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const fileUrl = fileURLToPath(import.meta.url);
const currentDir = dirname(fileUrl);
export default defineNuxtConfig({
  ssr: true,
  debug: true,
  devtools: { 
    enabled: true 
  },
  modules: [
    '@pinia/nuxt',
    '@nuxtjs/supabase'
  ],
  imports: {
    dirs: [
      join(currentDir, './models'), 
    ]
  },
  runtimeConfig: {
    public: {
      url: process.env.APP_URL,
      app: {
        name: packageJson.name,
        version: packageJson.version
      }
    },
  },
  supabase: {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_KEY,
    serviceKey: process.env.SUPABASE_SERVICE_KEY,
    redirect: false,
    redirectOptions: {
      login: '/login',
      callback: '/',
      exclude: [],
    }
  },
})
