// Ignore cosmetic changes; compare wording and openings across channels.
export function normalizeCaptionText(value) {
  return String(value || '').normalize('NFKC').toLocaleLowerCase('vi').replace(/#[\p{L}\p{N}_]+/gu, ' ').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}
export function findSimilarCaption(caption, previous) {
  const text = normalizeCaptionText(caption);
  const words = text.split(' ');
  const grams = new Set(words.slice(0, -1).map((word, i) => `${word} ${words[i + 1]}`));
  for (const candidate of previous) {
    const other = normalizeCaptionText(candidate);
    if (!other) continue;
    if (text === other) return candidate;
    const otherWords = other.split(' ');
    if (words.length >= 7 && otherWords.length >= 7 && words.slice(0, 7).join(' ') === otherWords.slice(0, 7).join(' ')) return candidate;
    const otherGrams = new Set(otherWords.slice(0, -1).map((word, i) => `${word} ${otherWords[i + 1]}`));
    const shared = [...grams].filter(gram => otherGrams.has(gram)).length;
    if (grams.size >= 5 && otherGrams.size >= 5 && 2 * shared / (grams.size + otherGrams.size) >= 0.58) return candidate;
  }
  return null;
}
