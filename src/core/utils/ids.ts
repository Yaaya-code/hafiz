/**
 * Pure id helpers for the core domain.
 * No side effects beyond Math.random for client-side draft ids.
 */

/** Create a lightweight unique id (not cryptographically secure). */
export function createEntityId(prefix: string): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${rand}`;
}
