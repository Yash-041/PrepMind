export interface SessionUser {
  id: string;
  full_name: string;
  email: string;
  target_exam: "JEE Main" | "JEE Advanced";
  student_class: "Class 11" | "Class 12" | "Class 12 pass out";
  auth_provider: string;
  is_verified: boolean;
  has_password: boolean;
}

/** Replace the cached user (e.g. after a profile edit) and tell the header to refresh. */
export function updateSessionUser(user: SessionUser): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  window.dispatchEvent(new Event("prepmind-profile-updated"));
}

const TOKEN_KEY = "prepmind_access_token";
const USER_KEY = "prepmind_user_profile";

export function saveSession(token: string, user: SessionUser): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getAccessToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getSessionUser(): SessionUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem("prepmind-chat-id");
}