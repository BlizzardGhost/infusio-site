// src/lib/verify.ts

/** Simple RFC-ish email check (good enough for UI + basic server guard). */
export function isEmail(value: string): boolean {
  if (!value) return false;
  const s = String(value).trim();
  // basic, readable pattern; avoids catastrophic backtracking
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}