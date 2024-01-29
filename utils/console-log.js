export default async function (message, ...args) {
  if (process.env.NODE_ENV === 'development') {
    console.log(message, ...args);
  }
}