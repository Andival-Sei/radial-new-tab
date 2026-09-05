export function normalizeUrl(value: string) {
  const text = value.trim();
  if (!text || /\s/.test(text) || (/^[a-z][a-z\d+.-]*:/i.test(text) && !/^https?:\/\//i.test(text))) throw new Error('invalid URL');
  const parsed = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('invalid URL');
  return parsed.toString();
}
