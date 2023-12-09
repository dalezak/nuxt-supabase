// https://nuxt.com/docs/api/configuration/nuxt-config
import packageJson from './package.json';
export default defineNuxtConfig({
  ssr: true,
  debug: true,
  devtools: { 
    enabled: true 
  },
  modules: [
    '@pinia/nuxt',
    '@nuxtjs/supabase',
    '@vue-macros/nuxt'
  ],
  plugins: [
    '@/plugins/storage.js'
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
  supabase: {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_KEY,
    serviceKey: process.env.SUPABASE_SERVICE_KEY,
    redirect: false,
    redirectOptions: {
      login: '/login',
      callback: '/confirm',
      exclude: [],
    }
  },
})
