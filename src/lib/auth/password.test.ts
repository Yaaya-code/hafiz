import { describe, expect, it } from "vitest";
import {
  hashPassword,
  validateEmail,
  validatePasswordStrength,
  verifyPassword,
} from "./password";

describe("auth password utilities", () => {
  it("validates email format", () => {
    expect(validateEmail("a@b.com")).toBeNull();
    expect(validateEmail("bad")).not.toBeNull();
    expect(validateEmail("")).not.toBeNull();
  });

  it("validates password strength", () => {
    expect(validatePasswordStrength("short")).not.toBeNull();
    expect(validatePasswordStrength("longenough")).toBeNull();
    expect(validatePasswordStrength("x".repeat(73))).not.toBeNull();
  });

  it("hashes and verifies passwords", async () => {
    const hash = await hashPassword("secure-pass-99");
    expect(hash).not.toBe("secure-pass-99");
    expect(await verifyPassword("secure-pass-99", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });
});
