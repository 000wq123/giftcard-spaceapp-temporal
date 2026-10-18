import { z } from "zod";
import { vaultAgentFillRequestSchema, vaultAgentResultSchema, type Pane, type VaultAgentResult } from "@space/contracts";
import type { VaultModule } from "../vault/wiring.js";

/**
 * Nous's handle-only Vault tool (plan clipboard:vEYtT6-bEN0J step 4): Nous names a pane and an item handle, never a value,
 * username, URL or selector, and gets back only {status, auditId}. While the agent-fill gate fails every call is BLOCKED;
 * the sealed fill itself runs only in the Browser Host path (held branch), so until that ships an open gate answers BLOCKED too.
 */
export const nousVaultFillArgsSchema = z.object({
  room: z.string().trim().min(1).max(200).describe("The room's name as shown in the world (or its id)."),
  pane: z.string().trim().min(1).max(160).describe("The pane whose browser page gets the fill."),
  handle: vaultAgentFillRequestSchema.shape.handle.describe("The Vault item handle (vault_item_...)."),
  fields: vaultAgentFillRequestSchema.shape.fields
}).strict();

export const NOUS_VAULT_FILL_DESCRIPTION = "Ask the Vault to fill a delegated item into a pane's open browser page by handle. "
  + "You never see or send a value, username, URL or selector; the answer is only {status, auditId}. BLOCKED means agent fills are off "
  + "or the item is not delegated for that page.";

export async function nousVaultFill(vault: VaultModule | undefined, owner: string, pane: Pane, args: z.infer<typeof nousVaultFillArgsSchema>): Promise<VaultAgentResult> {
  const gate = vault ? await vault.agentFillGate() : { enabled: false, reason: "VAULT_UNAVAILABLE" } as const;
  const reason = gate.enabled ? "FILL_PATH_UNAVAILABLE" : gate.reason;
  const audited = await vault?.repository?.appendAudit(owner, { actor: "AGENT", action: "FILL", result: "BLOCKED", reason, itemId: args.handle, fields: args.fields, paneId: pane.id }) ?? null;
  return vaultAgentResultSchema.parse({ status: "BLOCKED", auditId: audited?.id ?? null });
}
