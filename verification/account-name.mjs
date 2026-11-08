export function displayNameFromEmail(email) {
  if (typeof email !== 'string') return null;
  const parts = email.trim().split('@');
  if (parts.length !== 2 || !parts[0] || !parts[1].trim()) return null;
  const localPart = parts[0].split('+')[0].replace(/\p{N}/gu, '');
  const words = localPart.match(/\p{L}+/gu);
  if (!words?.length) return null;
  return words.map(word => word.charAt(0).toLocaleUpperCase() + word.slice(1)).join(' ').slice(0, 80).trim();
}
