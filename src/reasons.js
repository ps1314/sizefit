// Return-reason text classification (English + Chinese).
//
// Classes:
//   small   — item was too small / tight / short → the size runs small
//   large   — item was too big / loose / long   → the size runs large
//   fit     — size/fit complaint without a direction ("wrong size", "尺码不合适")
//   other   — a known non-size reason (damaged, colour, changed mind…)
//   unknown — empty, "Other", "N/A", …

const SMALL_EN = [
  /size (?:was )?too small/, /too small/, /too tight/, /\btight\b/, /\bsnug\b/,
  /run(?:s)? small/, /ran small/, /running small/, /smaller than (?:expected|i expected|usual|pictured)/,
  /siz(?:e|ed|ing) up/, /(?:a |one )?(?:bigger|larger) size/, /next size up/,
  /too short/, /too narrow/, /couldn'?t (?:get it on|zip|button)/, /can'?t (?:get it on|zip|button)/,
  /size_too_small/,
];
const LARGE_EN = [
  /size (?:was )?too (?:large|big)/, /too (?:big|large)/, /too loose/, /\bloose\b/, /\bbaggy\b/,
  /run(?:s)? (?:large|big)/, /ran (?:large|big)/, /running (?:large|big)/,
  /(?:bigger|larger) than (?:expected|i expected|usual|pictured)/,
  /siz(?:e|ed|ing) down/, /(?:a |one )?smaller size/, /next size down/,
  /too long/, /too wide/, /swimming in it/, /size_too_large/,
];
const FIT_EN = [
  /wrong size/, /didn'?t fit/, /does(?:n'?t| not) fit/, /not fit/, /poor fit/, /bad fit/,
  /size\s*\/\s*fit/, /\bfit\b/, /\bsize\b/, /\bsizing\b/,
];
const OTHER_EN = [
  /changed? (?:my|their)? ?mind/, /no longer (?:needed|wanted)/, /unwanted/, /damaged/, /defective/,
  /broken/, /quality/, /colou?r/, /\bstyle\b/, /not as (?:described|pictured)/, /wrong item/,
  /received the wrong/, /arrived (?:too )?late/, /late delivery/, /didn'?t like/, /did not like/, /don'?t like/,
  /ordered by mistake/, /duplicate order/, /\bfabric\b/, /\bmaterial\b/,
];

const SMALL_ZH = [/偏小/, /太小/, /小了/, /有点小/, /码小/, /太紧/, /偏紧/, /紧了/, /有点紧/, /很紧/, /勒/,
  /太短/, /偏短/, /短了/, /太窄/, /偏窄/, /穿不上/, /拍大/, /买大一码/, /(?:换|要)大一?码/];
const LARGE_ZH = [/偏大/, /太大/, /大了/, /有点大/, /码大/, /太松/, /偏松/, /松了/, /有点松/, /很松/, /太宽松/,
  /太肥/, /肥了/, /太宽/, /偏宽/, /太长/, /偏长/, /长了/, /(?:换|要)小一?码/];
const FIT_ZH = [/尺码/, /尺寸/, /大小/, /不合身/, /码数/];
const OTHER_ZH = [/质量/, /颜色/, /色差/, /款式/, /不喜欢/, /发错/, /破损/, /损坏/, /瑕疵/, /面料/, /不想要/, /拍错/];

const UNKNOWN = /^(|other|others|other reason|n\/?a|none|unknown|-+|—|\?|null|其他|其它|无)$/i;

// A negation shortly before a keyword cancels it: "not too small", "isn't tight", "不紧".
function negated(text, index) {
  const before = text.slice(Math.max(0, index - 14), index);
  return /\b(?:not|isn'?t|wasn'?t|aren'?t|weren'?t|never|no)\b[^.,;]*$/.test(before) || /不\s*$/.test(before);
}

function hits(text, patterns, { negatable = true } = {}) {
  let n = 0;
  for (const p of patterns) {
    const re = new RegExp(p.source, 'g');
    let m;
    while ((m = re.exec(text))) {
      if (!negatable || !negated(text, m.index)) n++;
      if (m[0] === '') re.lastIndex++;
    }
  }
  return n;
}

/**
 * Classify one or more reason strings (e.g. reason + sub-reason + customer note).
 * Returns { cls, small, large } where small/large are keyword hit counts.
 */
export function classifyReason(...parts) {
  const raw = parts.filter(p => p != null && String(p).trim() !== '').map(p => String(p).trim());
  const meaningful = raw.filter(p => !UNKNOWN.test(p));
  if (!meaningful.length) return { cls: 'unknown', small: 0, large: 0 };
  const text = meaningful.join(' | ').toLowerCase();

  const small = hits(text, SMALL_EN) + hits(text, SMALL_ZH);
  const large = hits(text, LARGE_EN) + hits(text, LARGE_ZH);
  if (small > large) return { cls: 'small', small, large };
  if (large > small) return { cls: 'large', small, large };
  if (small && large) return { cls: 'fit', small, large };
  if (hits(text, FIT_EN) + hits(text, FIT_ZH)) return { cls: 'fit', small, large };
  if (hits(text, OTHER_EN, { negatable: false }) + hits(text, OTHER_ZH, { negatable: false })) return { cls: 'other', small, large };
  return { cls: 'unknown', small, large };
}
