// Profile fallback from the pre-backend demo, still used for the header name when no
// session user is cached. Real sign-in lives in lib/session.ts and lib/api.ts.
export interface DemoProfile {
  name: string;
  targetExam: "JEE Main" | "JEE Advanced";
  currentClass: "Class 11" | "Class 12" | "Class 12 pass-out";
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

export function profileInitials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "PM";
}
