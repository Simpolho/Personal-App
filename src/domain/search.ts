/** Lower-case, accents removed, punctuation turned into single spaces, trimmed. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Words of a query, normalized. */
export function queryWords(query: string): string[] {
  return normalize(query).split(' ').filter(Boolean);
}

/** True when every query word is the start of some word in `key` (an already-normalized name). */
export function matchesKey(words: string[], key: string): boolean {
  if (words.length === 0) return false;
  return words.every((word) => key.startsWith(word) || key.includes(` ${word}`));
}

/** True when every word of the query is the start of some word in the name, ignoring case and accents. */
export function matches(query: string, name: string): boolean {
  return matchesKey(queryWords(query), normalize(name));
}
