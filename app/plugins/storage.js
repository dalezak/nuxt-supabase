import { Storage } from '../utils/storage';
export default defineNuxtPlugin(nuxtApp => {
  if (nuxtApp.$storage) {
    consoleLog("plugins/storage", "already loaded");
  }
  else {
    consoleLog("plugins/storage", "loaded");
    nuxtApp.provide('storage', Storage.instance());
  }
})