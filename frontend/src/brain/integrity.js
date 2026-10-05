const BANNED = [
  /guarantee/i, /\b\d+\s*x\b/i, /can(?:'|no)?t go down/i, /cannot go down/i, /buy now/i, /everyone buy/i, /financial advice/i,
  /risk[- ]free/i, /to the moon guaranteed/i, /partnership/i, /listing on/i, /listed on/i, /sure thing/i, /easy money/i, /pump it/i,
];

export const violatesIntegrity = (text) => BANNED.some((r) => r.test(text));

/** Every number in AI output must already appear in the verified draft line. */
export function numbersAreVerified(candidate, draft) {
  const nums = (s) => (s.match(/\d+(?:\.\d+)?/g) || []);
  const allowed = new Set(nums(draft));
  return nums(candidate).every((n) => allowed.has(n));
}
