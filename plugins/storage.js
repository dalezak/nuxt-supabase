import { Storage } from '../utils/storage';
export default defineNuxtPlugin(nuxtApp => {
  consoleLog("plugins/storage", process.client ? "client" : "server");
  nuxtApp.provide('storage', Storage.instance());
})