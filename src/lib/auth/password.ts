import bcrypt from "bcryptjs";

const ROUNDS = 10;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, ROUNDS);
}

export async function verifyPassword(
  password: string,
  passwordHash: string
): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

export function validatePasswordStrength(password: string): string | null {
  if (!password || password.length < 8) {
    return "كلمة المرور يجب أن تكون ٨ أحرف على الأقل";
  }
  // bcrypt practical limit; also avoids DoS via huge passwords
  if (password.length > 72) {
    return "كلمة المرور طويلة جداً (الحد ٧٢ حرفاً)";
  }
  return null;
}

export function validateEmail(email: string): string | null {
  const e = email.trim().toLowerCase();
  if (!e || e.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
    return "بريد إلكتروني غير صالح";
  }
  return null;
}
