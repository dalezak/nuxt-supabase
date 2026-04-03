import isDev from "./is-dev";

export default async function (message, ...args) {
  if (isDev()) {
    let client = import.meta.client ? "client" : "server";
    console.error(client, message, ...args);
  }
}