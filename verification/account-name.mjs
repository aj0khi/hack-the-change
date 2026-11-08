export function displayNameFromEmail(email) {
  if (typeof email !== 'string') return null;
  const parts = email.trim().split('@');
  if (parts.length !== 2 || !parts[0] || !parts[1].trim()) return null;
  const localPart = parts[0].split('+')[0];
  const words = localPart.match(/[\p{L}\p{N}]+/gu);
  if (!words?.some(word => /\p{L}/u.test(word))) return null;
  return words.map(word => word.charAt(0).toLocaleUpperCase() + word.slice(1)).join(' ').slice(0, 80).trim();
}
