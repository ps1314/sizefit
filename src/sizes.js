// Size parsing: pull a canonical size out of variant titles, line item names and SKUs.
//
// Two size families are supported:
//   letter  — XXS … 5XL (ordered)
//   numeric — 0–60, optional .5, with optional US/UK/EU/W prefix (ordered by value)
// "One size" values are recognised and marked so they can be excluded.

export const LETTER_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL'];

const LETTER_ALIASES = {
  XXS: 'XXS', '2XS': 'XXS', XXSMALL: 'XXS',
  XS: 'XS', XSMALL: 'XS', EXTRASMALL: 'XS',
  S: 'S', SM: 'S', SMALL: 'S',
  M: 'M', MD: 'M', MED: 'M', MEDIUM: 'M',
  L: 'L', LG: 'L', LARGE: 'L',
  XL: 'XL', XLARGE: 'XL', EXTRALARGE: 'XL',
  XXL: 'XXL', '2XL': 'XXL', XXLARGE: 'XXL', '2X': 'XXL', '1X': 'XL',
  XXXL: '3XL', '3XL': '3XL', '3X': '3XL',
  XXXXL: '4XL', '4XL': '4XL', '4X': '4XL',
  '5XL': '5XL', '5X': '5XL',
};

const ONE_SIZE = /^(os|one ?size|onesize|o\/s|free ?size|均码)$/i;
const NUMERIC = /^(?:us|uk|eu|w)?(\d{1,2}(?:\.5)?)(?:w)?$/i;

function joinMultiWord(s) {
  return s
    .replace(/\b(extra|x)[\s-]+(small|large)\b/gi, (_, a, b) => `${a}${b}`)
    .replace(/\b(xx|xxx|xxxx)[\s-]+(small|large)\b/gi, (_, a, b) => `${a}${b}`);
}

function tokens(s) {
  return joinMultiWord(String(s))
    .split(/[\s\/,|_\-:()\[\]]+/)
    .map(t => t.trim())
    .filter(Boolean);
}

/** Canonicalise one token, or return null if it is not a size. */
export function canonicalSize(token, { allowNumeric = true } = {}) {
  if (!token) return null;
  const t = String(token).trim();
  if (ONE_SIZE.test(t)) return { size: 'ONE SIZE', family: 'one', rank: 0 };
  const key = t.toUpperCase().replace(/[\s.-]/g, '');
  const letter = LETTER_ALIASES[key];
  if (letter) return { size: letter, family: 'letter', rank: LETTER_ORDER.indexOf(letter) };
  if (allowNumeric) {
    const m = t.match(NUMERIC);
    if (m) {
      const v = Number(m[1]);
      if (v >= 0 && v <= 60) return { size: m[1], family: 'numeric', rank: v };
    }
  }
  return null;
}

/** Strip a "Size:" label so "Size: M" style option strings tokenise cleanly. */
function stripLabels(s) {
  return String(s).replace(/\b(size|尺码|尺寸|码)\s*[:：]?\s*/gi, ' ');
}

/**
 * Find the size inside a variant title ("M / Red", "Red / Size: L", "32W 30L").
 * Letter sizes win over numbers because colours/lengths are often numeric codes.
 */
export function sizeFromVariant(variant) {
  if (!variant) return null;
  for (const part of String(variant).split(/\s*[\/,|]\s*/)) {
    if (ONE_SIZE.test(part.trim())) return { size: 'ONE SIZE', family: 'one', rank: 0 };
  }
  const toks = tokens(stripLabels(variant));
  const parsed = toks.map(t => canonicalSize(t));
  return parsed.find(p => p && p.family === 'letter')
    || parsed.find(p => p && p.family === 'one')
    || parsed.find(p => p && p.family === 'numeric')
    || null;
}

/**
 * Find the size inside a SKU ("TEE-BLK-M", "JEAN-32"). Only the last two segments are
 * considered, and numbers only in the very last segment, so product/style codes like
 * "1023" in "SKU-1023-BLK-M" are not mistaken for sizes.
 */
export function sizeFromSku(sku) {
  if (!sku) return null;
  const toks = tokens(sku);
  if (!toks.length) return null;
  const last = toks[toks.length - 1];
  const prev = toks[toks.length - 2];
  return canonicalSize(last, { allowNumeric: true })
    || (prev && canonicalSize(prev, { allowNumeric: false }))
    || null;
}

/** Split a Shopify "Lineitem name" ("Classic Tee - M / Black") into product + variant. */
export function splitLineItemName(name) {
  if (!name) return { product: '', variant: '' };
  const idx = name.lastIndexOf(' - ');
  if (idx === -1) return { product: name.trim(), variant: '' };
  const variant = name.slice(idx + 3).trim();
  // Only treat the suffix as a variant if it actually looks like one (contains a size or a "/").
  if (sizeFromVariant(variant) || variant.includes('/')) {
    return { product: name.slice(0, idx).trim(), variant };
  }
  return { product: name.trim(), variant: '' };
}

/** Best-effort size for a line: variant title first, then line item name, then SKU. */
export function parseSize({ variant, name, sku } = {}) {
  return sizeFromVariant(variant)
    || (name ? sizeFromVariant(splitLineItemName(name).variant) : null)
    || sizeFromSku(sku)
    || null;
}

/**
 * Size mentioned in free text, e.g. exchange notes: "please send a size L", "换成M码".
 * Requires an explicit cue so random letters in prose are not read as sizes.
 */
export function sizeFromText(text) {
  if (!text) return null;
  const s = joinMultiWord(String(text));
  const re = /(?:size|in an?|in|to an?|to|for an?|for|换成?|要)\s*([A-Za-z0-9.]{1,6})(?:\s*码)?/gi;
  let m;
  while ((m = re.exec(s))) {
    const c = canonicalSize(m[1]);
    if (c && c.family !== 'one') return c;
  }
  const cn = s.match(/([A-Za-z0-9]{1,4})\s*码/);
  if (cn) {
    const c = canonicalSize(cn[1]);
    if (c && c.family !== 'one') return c;
  }
  return null;
}

/** -1 if a is smaller than b, 1 if larger, 0 if equal, null if not comparable. */
export function compareSizes(a, b) {
  if (!a || !b || a.family !== b.family || a.family === 'one') return null;
  return Math.sign(a.rank - b.rank);
}

export function sortSizes(list) {
  const famOrder = { letter: 0, numeric: 1, one: 2 };
  return [...list].sort((a, b) => (famOrder[a.family] - famOrder[b.family]) || (a.rank - b.rank));
}
