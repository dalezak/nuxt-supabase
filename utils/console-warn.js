import isDev from "./is-dev";

export default async function (message, ...args) {
  if (isDev()) {
    let client = process.client ? "client" : "server";
    console.warn(client, message, ...args);
  }
}