export interface PasswordPolicyResult {
  ok: boolean;
  requirements: { id: string; label: string; met: boolean }[];
}

export function evaluatePasswordPolicy(password: string): PasswordPolicyResult {
  const requirements = [
    { id: "length", label: "At least 12 characters", met: password.length >= 12 },
    { id: "upper", label: "One uppercase letter (A–Z)", met: /[A-Z]/.test(password) },
    { id: "lower", label: "One lowercase letter (a–z)", met: /[a-z]/.test(password) },
    { id: "number", label: "One number (0–9)", met: /[0-9]/.test(password) },
    { id: "special", label: "One special character (!@#$…)", met: /[^A-Za-z0-9]/.test(password) },
  ];
  return { ok: requirements.every((item) => item.met), requirements };
}

export function passwordStrengthScore(password: string): 0 | 1 | 2 | 3 | 4 {
  if (!password) return 0;
  const met = evaluatePasswordPolicy(password).requirements.filter((item) => item.met).length;
  return Math.max(0, met - 1) as 0 | 1 | 2 | 3 | 4;
}
