export function parseAllowedEmails(): Set<string> {
  const raw = process.env.ALLOWED_USER_EMAILS?.trim() ?? "";
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const allowed = parseAllowedEmails();
  if (allowed.size === 0) return false;
  return allowed.has(normalizeEmail(email));
}
