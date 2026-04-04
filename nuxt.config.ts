// https://nuxt.com/docs/api/configuration/nuxt-config
import packageJson from './package.json';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const currentDir = dirname(fileURLToPath(import.meta.url));
export default defineNuxtConfig({
  srcDir: join(currentDir, 'app'),
  ssr: true,
  debug: true,
  devtools: { 
    enabled: true 
  },
  modules: [
    '@pinia/nuxt',
    '@nuxtjs/supabase'
  ],
  runtimeConfig: {
    public: {
      url: process.env.APP_URL,
      app: {
        name: packageJson.name,
        version: packageJson.version
      }
    },
  },
  vite: {
    resolve: {
      dedupe: ['pinia', 'vue']
    }
  },
  pinia: {
    storesDirs: [
      join(currentDir, 'app/stores/**')
    ]
  },
  supabase: {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_KEY,
    secretKey: process.env.SUPABASE_SECRET_KEY,
    redirect: false,
    redirectOptions: {
      login: '/login',
      callback: '/',
      exclude: [],
    }
  },
})
