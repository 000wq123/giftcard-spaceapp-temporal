/**
 * Connecting an email/calendar account leaves Space for Google or Microsoft and
 * comes back to `/?connector=<result>`. This is the message shown on return.
 */
export interface ConnectorResultMessage { tone: "notice" | "error"; text: string }

const retry = "Open a Dot's Tools view and connect again.";
const messages: Record<string, ConnectorResultMessage> = {
  connected: { tone: "notice", text: "Account connected. Your Dots can use it from now on; sending email and creating events still wait for your approval." },
  cancelled: { tone: "error", text: `The account was not connected: the sign-in was cancelled or the provider refused it. ${retry}` },
  expired: { tone: "error", text: `The sign-in took too long or was started in another tab. ${retry}` },
  session: { tone: "error", text: "The sign-in finished in a different Space session than the one that started it. Connect again from this window." },
  connector_sign_in_expired: { tone: "error", text: `The sign-in expired before it finished. ${retry}` },
  connector_no_email: { tone: "error", text: "The account has no verified email address, so it was not connected." },
  connector_no_offline_access: { tone: "error", text: "The provider did not grant lasting access. Remove Space's access in your account settings, then connect again from a Dot's Tools view." },
  connector_unavailable: { tone: "error", text: "That provider is not configured on this server." }
};

export function connectorResultMessage(result: string | null): ConnectorResultMessage | null {
  if (!result) return null;
  return messages[result] ?? { tone: "error", text: `The account could not be connected. ${retry}` };
}
