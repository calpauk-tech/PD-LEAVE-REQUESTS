/**
 * String normalization and fuzzy matching algorithms for entity resolution.
 */

export function normalizeString(str: any): string {
  if (str === null || str === undefined) return "";
  return String(str)
    .normalize("NFKC")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics / accents
    .toLowerCase()
    .replace(/[^\w\s]/g, " ") // replace punctuation with spaces
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Bigram Dice Coefficient for fuzzy similarity (returns 0.0 to 1.0)
 */
export function diceCoefficient(a: string, b: string): number {
  const normA = normalizeString(a);
  const normB = normalizeString(b);

  if (normA === normB) return 1.0;
  if (!normA || !normB) return 0.0;
  if (normA.length < 2 || normB.length < 2) {
    return normA === normB ? 1.0 : 0.0;
  }

  const getBigrams = (str: string): Map<string, number> => {
    const bigrams = new Map<string, number>();
    for (let i = 0; i < str.length - 1; i++) {
      const pair = str.substring(i, i + 2);
      bigrams.set(pair, (bigrams.get(pair) || 0) + 1);
    }
    return bigrams;
  };

  const bigramsA = getBigrams(normA);
  const bigramsB = getBigrams(normB);

  let intersection = 0;
  for (const [pair, countA] of bigramsA.entries()) {
    const countB = bigramsB.get(pair) || 0;
    intersection += Math.min(countA, countB);
  }

  const total = (normA.length - 1) + (normB.length - 1);
  return (2.0 * intersection) / total;
}

/**
 * Token-based matching: checks if all words of one string appear in the other,
 * handles "LastName, FirstName" and middle names.
 */
export function tokenSimilarity(a: string, b: string): number {
  const normA = normalizeString(a);
  const normB = normalizeString(b);

  if (normA === normB) return 1.0;
  if (!normA || !normB) return 0.0;

  const tokensA = new Set(normA.split(" ").filter(Boolean));
  const tokensB = new Set(normB.split(" ").filter(Boolean));

  if (tokensA.size === 0 || tokensB.size === 0) return 0.0;

  let common = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) {
      common++;
    } else {
      // Check partial match for abbreviations (e.g. J. vs Jane)
      for (const tb of tokensB) {
        if ((t.length === 1 && tb.startsWith(t)) || (tb.length === 1 && t.startsWith(tb))) {
          common += 0.5;
          break;
        }
      }
    }
  }

  const recall = common / Math.max(tokensA.size, tokensB.size);
  return recall;
}

/**
 * Combined comprehensive similarity score (0.0 to 1.0)
 */
export function calculateNameSimilarity(strA: string, strB: string): number {
  const normA = normalizeString(strA);
  const normB = normalizeString(strB);

  if (normA === normB) return 1.0;
  if (!normA || !normB) return 0.0;

  // Check reversed tokens (e.g. "Smith Jane" vs "Jane Smith")
  const wordsA = normA.split(" ").filter(Boolean);
  const reversedA = [...wordsA].reverse().join(" ");
  if (reversedA === normB) return 0.98;

  // Check substring containment
  if (normA.includes(normB) || normB.includes(normA)) {
    const minLen = Math.min(normA.length, normB.length);
    const maxLen = Math.max(normA.length, normB.length);
    return 0.85 + 0.15 * (minLen / maxLen);
  }

  const tokenSim = tokenSimilarity(normA, normB);
  const diceSim = diceCoefficient(normA, normB);

  // Weighted blend: token similarity is usually best for names, with dice smoothing typos
  return Math.max(tokenSim * 0.7 + diceSim * 0.3, diceSim);
}
