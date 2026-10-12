import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export function collectExportableApiKeys(): Record<string, string> {
  const keys: Record<string, string> = {};

  const candidateDirs = [
    process.env.SPACE_SECRETS_ROOT,
    "/opt/spaceapp/secrets",
    "./secrets",
    "/run/spaceapp-secrets/providers",
    "./secrets/providers",
    "/var/lib/spaceapp-cli/imported-credentials"
  ].filter(Boolean) as string[];

  for (const dir of candidateDirs) {
    if (existsSync(dir)) {
      try {
        const files = readdirSync(dir);
        for (const file of files) {
          if (file.endsWith(".key")) {
            const providerName = file.replace(/^space-/, "").replace(/\.key$/, "");
            try {
              const content = readFileSync(join(dir, file), "utf8").trim();
              if (content && !keys[providerName]) {
                keys[providerName] = content;
              }
            } catch {}
          }
        }
      } catch {}
    }
  }

  const envFileCandidates = [
    "/opt/spaceapp/var/deepseek-harness/secrets/providers.env",
    "./var/deepseek-harness/secrets/providers.env"
  ];
  for (const envFile of envFileCandidates) {
    if (existsSync(envFile)) {
      try {
        const lines = readFileSync(envFile, "utf8").split("\n");
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
            const [k, ...rest] = trimmed.split("=");
            const val = rest.join("=").trim().replace(/^["']|["']$/g, "");
            if (k && val) {
              const lowerKey = k.toLowerCase().replace(/_api_key|_key$/, "");
              if (!keys[lowerKey]) {
                keys[lowerKey] = val;
              }
            }
          }
        }
      } catch {}
    }
  }

  const envMap: Record<string, string> = {
    DEEPSEEK_API_KEY: "deepseek",
    OPENAI_API_KEY: "codex",
    ANTHROPIC_API_KEY: "claude",
    GEMINI_API_KEY: "gemini",
    QWEN_API_KEY: "qwen",
    KIMI_API_KEY: "kimi",
    XAI_API_KEY: "grok",
    GROK_API_KEY: "grok",
    OPENCODE_API_KEY: "opencode",
    AUTOHAND_API_KEY: "autohand"
  };
  for (const [envVar, providerId] of Object.entries(envMap)) {
    const val = process.env[envVar];
    if (val && !keys[providerId]) {
      keys[providerId] = val.trim();
    }
  }

  return keys;
}

export function collectExportableCredentials(): Record<string, string> {
  const creds: Record<string, string> = {};
  const home = process.env.HOME || "/var/lib/spaceapp-user";
  const codexHome = process.env.CODEX_HOME || join(home, ".codex");

  const candidates: Array<{ provider: string; path: string }> = [
    { provider: "claude", path: join(codexHome, "space-claude", ".credentials.json") },
    { provider: "claude", path: "/var/lib/spaceapp-cli/providers/claude/.credentials.json" },
    { provider: "cursor", path: join(codexHome, "space-cursor", ".config", "cursor", "auth.json") },
    { provider: "cursor", path: "/var/lib/spaceapp-cli/providers/cursor/.config/cursor/auth.json" },
    { provider: "gemini", path: join(codexHome, "space-gemini", "profiles", "7", "home", ".gemini", "oauth_creds.json") },
    { provider: "gemini", path: "/var/lib/spaceapp-cli/providers/gemini/.gemini/oauth_creds.json" },
    { provider: "qwen", path: join(codexHome, "space-qwen", ".qwen", "oauth_creds.json") },
    { provider: "qwen", path: "/var/lib/spaceapp-cli/providers/qwen/.qwen/oauth_creds.json" },
    { provider: "grok", path: join(codexHome, "space-grok", ".grok", "credentials.json") },
    { provider: "grok", path: "/var/lib/spaceapp-cli/providers/grok/.grok/credentials.json" },
    { provider: "kimi", path: join(codexHome, "space-kimi", ".kimi", "credentials.json") },
    { provider: "kimi", path: "/var/lib/spaceapp-cli/providers/kimi/.kimi/credentials.json" },
    { provider: "copilot", path: join(codexHome, "space-copilot", "config.json") },
    { provider: "copilot", path: "/var/lib/spaceapp-cli/providers/copilot/config.json" }
  ];

  for (const { provider, path } of candidates) {
    if (!creds[provider] && existsSync(path)) {
      try {
        const data = readFileSync(path, "utf8").trim();
        if (data) {
          creds[provider] = data;
        }
      } catch {}
    }
  }

  const codexHomesDir = join(codexHome, "space-codex-homes");
  if (!creds["codex"] && existsSync(codexHomesDir)) {
    try {
      const entries = readdirSync(codexHomesDir);
      let latestAuth: string | null = null;
      let latestMtime = 0;
      for (const entry of entries) {
        const authPath = join(codexHomesDir, entry, "auth.json");
        if (existsSync(authPath)) {
          try {
            const stat = statSync(authPath);
            if (stat.mtimeMs > latestMtime && stat.size > 2) {
              latestMtime = stat.mtimeMs;
              latestAuth = authPath;
            }
          } catch {}
        }
      }
      if (latestAuth) {
        creds["codex"] = readFileSync(latestAuth, "utf8").trim();
      }
    } catch {}
  }

  return creds;
}

export function writeImportedApiKeys(
  apiKeys: Record<string, string>,
  options: { secretsDir?: string } = {}
): { imported: number; targetDir: string } {
  let targetDir = options.secretsDir;
  if (!targetDir) {
    if (existsSync("/var/lib/spaceapp-cli/imported-credentials")) {
      targetDir = "/var/lib/spaceapp-cli/imported-credentials";
    } else if (existsSync("./secrets")) {
      targetDir = "./secrets/providers";
    } else if (existsSync("/backups")) {
      targetDir = "/backups/providers-secrets";
    } else {
      targetDir = "./secrets/providers";
    }
  }

  try {
    mkdirSync(targetDir, { recursive: true });
  } catch {}

  let imported = 0;
  for (const [provider, key] of Object.entries(apiKeys)) {
    if (key && typeof key === "string") {
      const fileName = `${provider}.key`;
      const filePath = join(targetDir, fileName);
      try {
        writeFileSync(filePath, key.trim() + "\n", { mode: 0o600 });
        imported++;
      } catch {}
    }
  }
  return { imported, targetDir };
}

export function writeImportedCredentials(
  credentials: Record<string, string>,
  options: { credentialsDir?: string } = {}
): { imported: number; targetDir: string } {
  let targetDir = options.credentialsDir;
  if (!targetDir) {
    if (existsSync("/var/lib/spaceapp-cli/providers")) {
      targetDir = "/var/lib/spaceapp-cli/providers";
    } else if (existsSync("/backups")) {
      targetDir = "/backups/providers-credentials";
    } else {
      targetDir = "./secrets/credentials";
    }
  }

  try {
    mkdirSync(targetDir, { recursive: true });
  } catch {}

  let imported = 0;
  for (const [provider, data] of Object.entries(credentials)) {
    if (data && typeof data === "string") {
      const provDir = join(targetDir, provider);
      try {
        mkdirSync(provDir, { recursive: true });
        const authFileName = provider === "claude" ? ".credentials.json" : "auth.json";
        writeFileSync(join(provDir, authFileName), data.trim() + "\n", { mode: 0o600 });
        imported++;
      } catch {}
    }
  }
  return { imported, targetDir };
}
