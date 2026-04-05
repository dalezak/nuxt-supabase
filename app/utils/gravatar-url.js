/**
 * Returns a Gravatar URL for the given email using SHA-256 (supported since 2024).
 * Pass size in pixels (default 200). Uses ?d=404 so callers can detect missing avatars.
 */
export default async function (email, size = 200) {
  if (!email || !import.meta.client) return null;
  const normalised = email.trim().toLowerCase();
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalised));
  const hash = Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  return `https://www.gravatar.com/avatar/${hash}?d=404&s=${size}`;
}
