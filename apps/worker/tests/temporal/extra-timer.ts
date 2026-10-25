import { sleep } from "@temporalio/workflow";
import { dotGoalWorkflow as original } from "../../src/workflows.js";
/** Add a real command before the production workflow to prove replay detects timer drift. */
export async function dotGoalWorkflow(input: { goalId: string }) {
  await sleep("1 second");
  return original(input);
}
