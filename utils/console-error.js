export default async function (message, ...args) {
  if (process.env.NODE_ENV === 'development') {
    console.error(message, ...args);
  }
}