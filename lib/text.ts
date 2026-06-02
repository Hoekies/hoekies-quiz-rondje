// Tekst-helpers voor vraagtypen.

// Deterministische pseudo-random op basis van een string-seed (mulberry32 + simpele hash).
// Zo zien speler en presentatie exact dezelfde geschudde letters.
function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Schud de letters van een woord door elkaar (per woord; spaties blijven staan).
// Garandeert dat het resultaat verschilt van het origineel bij woorden > 1 unieke letter.
export function scramble(word: string, seed: string): string {
  const rand = seededRandom(seed + ":" + word);
  return word
    .split(" ")
    .map((part) => {
      if (part.length < 2) return part;
      const chars = part.split("");
      for (let attempt = 0; attempt < 8; attempt++) {
        for (let i = chars.length - 1; i > 0; i--) {
          const j = Math.floor(rand() * (i + 1));
          [chars[i], chars[j]] = [chars[j], chars[i]];
        }
        if (chars.join("") !== part) break;
      }
      return chars.join("");
    })
    .join("   ")
    .toUpperCase();
}
