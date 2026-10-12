export interface YouTubeAccounts {
  selectedProfileId: string | null;
  /** What the pane opens: the saved choice, or the primary Google account when nothing was chosen. */
  effectiveProfileId?: string | null;
  profiles: Array<{ profileId: string; displayName: string; browserStatus?: "NOT_CONNECTED" | "CONNECTED" | "REAUTHENTICATION_REQUIRED" | "UNKNOWN" }>;
}
/** A pane-only Chrome profile; never shared with other panes. */
export const privatePaneProfileId = "private:pane";

export type AccountMenuEntry = YouTubeAccounts["profiles"][number] & { group: "google" | "private" | "legacy" };

/** Linked Google accounts first, then the private pane profile, then Gemini accounts (one shared profile each). */
export function accountMenuEntries(accounts: YouTubeAccounts): AccountMenuEntry[] {
  const google = accounts.profiles.filter(profile => profile.profileId.startsWith("google_account:"));
  const legacy = accounts.profiles.filter(profile => !profile.profileId.startsWith("google_account:") && profile.profileId !== privatePaneProfileId);
  return [
    ...google.map(profile => ({ ...profile, group: "google" as const })),
    { profileId: privatePaneProfileId, displayName: "Private pane profile", group: "private" as const },
    ...legacy.map(profile => ({ ...profile, group: "legacy" as const }))
  ];
}

export function effectiveAccountId(accounts: YouTubeAccounts): string {
  return accounts.effectiveProfileId ?? accounts.selectedProfileId ?? privatePaneProfileId;
}

/** Short selector label; UNKNOWN stays silent because it is not evidence either way. */
export function browserAccountStatusLabel(status: YouTubeAccounts["profiles"][number]["browserStatus"]): string | null {
  if (status === "CONNECTED") return "Connected";
  if (status === "NOT_CONNECTED") return "Sign-in needed";
  if (status === "REAUTHENTICATION_REQUIRED") return "Reauthentication required";
  return null;
}

export function accountMenuLabel(profile: { displayName: string; browserStatus?: YouTubeAccounts["profiles"][number]["browserStatus"] }): string {
  const status = browserAccountStatusLabel(profile.browserStatus);
  return status ? `${profile.displayName} · ${status}` : profile.displayName;
}

/** Uses the server's account-specific sign-in URL; older servers fall back to a plain sign-in. */
export function googleSignInTarget(serverTarget: string, fallback: string): string {
  try {
    const url = new URL(serverTarget);
    if (url.origin === "https://accounts.google.com") return url.href;
  } catch { /* fall through */ }
  return fallback;
}

export interface YouTubeAccountSelection {
  selectedProfileId: string | null;
  targetUrl: string;
}
