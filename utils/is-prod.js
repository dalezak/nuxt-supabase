export default async function () {
  return process.env.NODE_ENV === 'prod' || process.env.NODE_ENV === 'production';
}