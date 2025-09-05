// src/lib/verify.ts
export async function verifyEmailAddress(email: string) {
  const base = import.meta.env.EMAIL_VERIFY_URL!;
  const key  = import.meta.env.EMAIL_VERIFY_KEY!;

  const res = await fetch(`${base}?email=${encodeURIComponent(email)}`, {
    headers: { Authorization: `Bearer ${key}` }
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(`Verify API error: ${res.status} ${msg}`);
  }
  // normalize to a minimal shape { deliverable: boolean, reason?: string }
  const data = await res.json();
  return {
    deliverable: !!(data.deliverable ?? data.is_valid ?? data.result === 'valid'),
    raw: data
  };
}