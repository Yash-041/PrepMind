export interface DemoProfile {
  name: string;
  targetExam: "JEE Main" | "JEE Advanced";
  currentClass: "Class 11" | "Class 12" | "Class 12 pass-out";
}

export const DEMO_EMAIL = "student@prepmind.ai";
export const DEFAULT_DEMO_PASSWORD = "PrepMind@123";
const RESET_REQUEST_KEY = "prepmind-demo-password-reset";
const REGISTERED_EMAIL_KEY = "prepmind-demo-email";

interface DemoPasswordReset {
  token: string;
  email: string;
  expiresAt: number;
}

export const DEFAULT_DEMO_PROFILE: DemoProfile = {
  name: "Aarav Kumar",
  targetExam: "JEE Advanced",
  currentClass: "Class 12",
};

export function getDemoProfile(): DemoProfile {
  const stored = localStorage.getItem("prepmind-demo-profile");
  if (!stored) return DEFAULT_DEMO_PROFILE;
  try {
    return { ...DEFAULT_DEMO_PROFILE, ...JSON.parse(stored) } as DemoProfile;
  } catch {
    return DEFAULT_DEMO_PROFILE;
  }
}

export function saveDemoProfile(profile: DemoProfile, password?: string): void {
  localStorage.setItem("prepmind-demo-profile", JSON.stringify(profile));
  if (password) localStorage.setItem("prepmind-demo-password", password);
  window.dispatchEvent(new Event("prepmind-profile-updated"));
}

export function getRegisteredDemoEmail(): string {
  return localStorage.getItem(REGISTERED_EMAIL_KEY) ?? DEMO_EMAIL;
}

export function saveDemoAccount(profile: DemoProfile, email: string, password: string): void {
  localStorage.setItem(REGISTERED_EMAIL_KEY, email.trim().toLowerCase());
  saveDemoProfile(profile, password);
}

export function authenticateDemoUser(email: string, password: string): boolean {
  const savedPassword = localStorage.getItem("prepmind-demo-password") ?? DEFAULT_DEMO_PASSWORD;
  return email.trim().toLowerCase() === getRegisteredDemoEmail() && password === savedPassword;
}

export function verifyDemoPassword(password: string): boolean {
  return password === (localStorage.getItem("prepmind-demo-password") ?? DEFAULT_DEMO_PASSWORD);
}

export function resetDemoPassword(): void {
  localStorage.removeItem("prepmind-demo-password");
}

export function createDemoPasswordReset(): DemoPasswordReset {
  const request: DemoPasswordReset = {
    token: crypto.randomUUID(),
    email: getRegisteredDemoEmail(),
    expiresAt: Date.now() + 15 * 60 * 1000,
  };
  localStorage.setItem(RESET_REQUEST_KEY, JSON.stringify(request));
  return request;
}

export function getPendingDemoPasswordReset(): DemoPasswordReset | null {
  const stored = localStorage.getItem(RESET_REQUEST_KEY);
  if (!stored) return null;
  try {
    const request = JSON.parse(stored) as DemoPasswordReset;
    if (request.email !== getRegisteredDemoEmail() || request.expiresAt <= Date.now()) {
      localStorage.removeItem(RESET_REQUEST_KEY);
      return null;
    }
    return request;
  } catch {
    localStorage.removeItem(RESET_REQUEST_KEY);
    return null;
  }
}

export function isValidDemoResetToken(token: string | null): boolean {
  const request = getPendingDemoPasswordReset();
  return Boolean(token && request && request.token === token);
}

export function completeDemoPasswordReset(token: string, password: string): boolean {
  if (!isValidDemoResetToken(token)) return false;
  localStorage.setItem("prepmind-demo-password", password);
  localStorage.removeItem(RESET_REQUEST_KEY);
  return true;
}

export function profileInitials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "PM";
}