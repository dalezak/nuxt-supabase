export default async function (message, ...args) {
  if (process.env.NODE_ENV === 'development') {
    var source = process.client ? "client" : "server";
    console.error(message, ...args, source);
  }
}