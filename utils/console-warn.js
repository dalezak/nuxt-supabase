export default async function (message, ...args) {
  if (process.env.NODE_ENV === 'development') {
    let client = process.client ? "client" : "server";
    console.warn(client, message, ...args);
  }
}