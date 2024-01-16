export default async function (message, details="") {
  if (process.env.NODE_ENV === 'development') {
    console.error(message, details);
  }
}