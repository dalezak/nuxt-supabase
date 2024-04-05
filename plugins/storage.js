import { Storage } from '../utils/storage';
export default defineNuxtPlugin(nuxtApp => {
  consoleLog("plugins/storage");
  nuxtApp.provide('storage', Storage.instance());
})