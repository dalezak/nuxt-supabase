export default async function () {
  return process.env.NODE_ENV === 'dev' || process.env.NODE_ENV === 'development';
}