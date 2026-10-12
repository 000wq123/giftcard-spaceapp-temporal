import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { WORKTREES_ROOT } from "../worktrees/worktree-service.js";

// The managed T3 sandbox can write only this repository's Git metadata and the
// managed worktree root (deploy/space-t3code.service ReadWritePaths).
export const T3_WORKTREE_REPOSITORY = "/opt/spaceapp";

const strictlyInside = (root: string, path: string) => {
  const rel = relative(root, path);
  return rel !== "" && rel !== ".." && !rel.startsWith(".." + sep) && !isAbsolute(rel);
};

/**
 * Canonical root of a Space-managed linked worktree of the T3 repository, or
 * null. Space owns these worktrees (unlike the private T3 workspace tree), so
 * the API checks them itself: a directory under the managed root whose `.git`
 * file names a worktree registered in the repository that links back to it.
 */
export async function t3WorktreeWorkspace(candidate: string, worktreesRoot = WORKTREES_ROOT,
  repository = T3_WORKTREE_REPOSITORY): Promise<string | null> {
  if (typeof candidate !== "string" || candidate.length > 4096 || !isAbsolute(candidate) || /[\x00-\x1f\x7f]/.test(candidate)) return null;
  try {
    const [root, target, registry] = await Promise.all([realpath(worktreesRoot), realpath(candidate), realpath(join(repository, ".git", "worktrees"))]);
    if (!strictlyInside(root, target) || !(await stat(target)).isDirectory()) return null;
    const pointer = /^gitdir: ([^\n]+)\n?$/.exec(await readFile(join(target, ".git"), "utf8"));
    if (!pointer) return null;
    const gitDir = await realpath(resolve(target, pointer[1]!));
    if (!strictlyInside(registry, gitDir) || relative(registry, gitDir).includes(sep)) return null;
    const backLink = (await readFile(join(gitDir, "gitdir"), "utf8")).trim();
    return await realpath(resolve(gitDir, backLink)) === join(target, ".git") ? target : null;
  } catch {
    return null;
  }
}
