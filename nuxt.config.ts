// https://nuxt.com/docs/api/configuration/nuxt-config
import packageJson from './package.json';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const currentDir = dirname(fileURLToPath(import.meta.url));
export default defineNuxtConfig({
  $meta: { name: 'nuxt-supabase' },
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
    },
    // Session storage: cookies for the SSR web build, localStorage for mobile.
    // @nuxtjs/supabase's client plugin uses cookie-backed storage
    // (@supabase/ssr) when useSsrCookies is true, else plain supabase-js
    // createClient with default localStorage persistence. In a Capacitor build
    // the app is served from capacitor://localhost, and WKWebView won't persist
    // cookies for that custom scheme — so the session written at signUp/login
    // never attaches to PostgREST requests, the client queries as anon, and RLS
    // `to authenticated` tables come back EMPTY with no error (the symptom:
    // jwt:NO count:0 reads). localStorage works in WKWebView, and the mobile
    // build is ssr:false so cookies buy nothing there. Gated on APP_ENV so every
    // app's mobile build (love-well / best-self / any-learn) inherits the fix.
    useSsrCookies: process.env.APP_ENV !== 'mobile',
  },
})
