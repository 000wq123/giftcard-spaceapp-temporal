import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ChessContestant, ChessMoveRequest, ChessMoveRequester } from "../chess/chess-players.js";
import { registerChessBenchmarkRoutes } from "../chess/chess-routes.js";
import {
  ChessTournamentRunner,
  ProviderSlots,
  buildMovePrompt,
  defaultSwissRounds,
  roundRobinSchedule,
  swissPairings,
  type ChessStanding,
  type ChessTournamentSettings,
} from "../chess/chess-tournament.js";
import { START_FEN, legalMoves, parseFen } from "../chess/chess-rules.js";

function contestant(name: string, effort = "low"): ChessContestant {
  return {
    id: `codex/${name}@${effort}`,
    modelId: `codex/${name}`,
    providerId: "codex",
    modelName: name,
    reasoningEffort: effort,
    displayName: `${name} · ${effort}`,
  };
}

function legalFromPrompt(prompt: string): string[] {
  return prompt.match(/^Legal moves \(UCI\): (.*)$/m)?.[1]?.split(" ") ?? [];
}

/** Plays the first legal move, or the last one for "greedy" players: deterministic and fast. */
const firstLegal: ChessMoveRequester = async ({ prompt, contestant: player }) => {
  const legal = legalFromPrompt(prompt);
  const move = player.modelName.startsWith("greedy") ? legal[legal.length - 1] : legal[0];
  return { text: JSON.stringify({ move }), tokens: 10 };
};

function standing(id: string, seed: number, extra: Partial<ChessStanding> = {}): ChessStanding {
  return {
    id, seed, points: 0, wins: 0, draws: 0, losses: 0, byes: 0, games: 0, elo: 1500, buchholz: 0,
    whiteGames: 0, blackGames: 0, modelMoves: 0, illegalReplies: 0, fallbackMoves: 0, forfeits: 0,
    totalLatencyMs: 0, tokens: 0, opponents: [], ...extra,
  };
}

const fast: ChessTournamentSettings = { format: "swiss", rounds: 3, moveTimeoutMs: 5_000, maxPlies: 30, concurrency: 4 };

let dir = "";
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "space-chess-test-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("chess pairings", () => {
  it("schedules every round-robin pair exactly once", () => {
    for (const size of [2, 4, 5, 6, 9]) {
      const ids = Array.from({ length: size }, (_, index) => `p${index}`);
      const rounds = roundRobinSchedule(ids);
      const pairs = rounds.flat().map(([a, b]) => [a, b].sort().join("|"));
      expect(new Set(pairs).size).toBe((size * (size - 1)) / 2);
      expect(pairs.length).toBe((size * (size - 1)) / 2);
      for (const round of rounds) {
        const players = round.flat();
        expect(new Set(players).size).toBe(players.length);
      }
    }
  });

  it("pairs Swiss rounds without rematches and gives the bye to the lowest player without one", () => {
    const standings = [
      standing("a", 0, { points: 2 }),
      standing("b", 1, { points: 2 }),
      standing("c", 2, { points: 1 }),
      standing("d", 3, { points: 1 }),
      standing("e", 4, { points: 0, byes: 1 }),
    ];
    const { pairs, bye } = swissPairings(standings, new Set(["a|b", "c|d"]), 3);
    expect(bye).toBe("d");
    const keys = pairs.map(([white, black]) => [white, black].sort().join("|"));
    expect(keys).not.toContain("a|b");
    expect(pairs.flat().sort()).toEqual(["a", "b", "c", "e"]);
  });

  it("gives White to the player who had Black more often", () => {
    const standings = [standing("a", 0, { whiteGames: 2, blackGames: 0 }), standing("b", 1, { whiteGames: 0, blackGames: 2 })];
    expect(swissPairings(standings, new Set(), 3).pairs).toEqual([["b", "a"]]);
  });

  it("uses log2 + 1 Swiss rounds, capped by the field", () => {
    expect(defaultSwissRounds(2)).toBe(1);
    expect(defaultSwissRounds(8)).toBe(4);
    expect(defaultSwissRounds(40)).toBe(7);
  });

  it("builds a compact prompt with FEN, history and the legal list", () => {
    const position = parseFen(START_FEN);
    const prompt = buildMovePrompt(position, legalMoves(position), [], 'bad "answer"\n');
    expect(prompt).toContain("You play White.");
    expect(prompt).toContain(`Position (FEN): ${START_FEN}`);
    expect(prompt).toContain("Moves so far (SAN): (none)");
    expect(legalFromPrompt(prompt)).toHaveLength(20);
    expect(prompt).toContain(`Your previous answer "bad 'answer'" was not a legal move.`);
  });
});

describe("chess tournament runner", () => {
  it("plays a full Swiss tournament with parallel games and consistent standings", async () => {
    const players = ["alpha", "greedy-beta", "gamma", "greedy-delta", "epsilon"].map((name) => contestant(name));
    const runner = new ChessTournamentRunner({ requestMove: firstLegal, stateFile: join(dir, "state.json") });
    await runner.start(fast, players);
    await runner.idle();

    const snapshot = (await runner.snapshot())!;
    expect(snapshot.status).toBe("completed");
    expect(snapshot.totals.games).toBe(3 * 2);
    expect(snapshot.totals.finished).toBe(6);
    expect(snapshot.standings).toHaveLength(5);
    const points = snapshot.standings.reduce((sum, row) => sum + row.points, 0);
    // One point per game plus one per bye.
    expect(points).toBe(6 + 3);
    expect(snapshot.standings.reduce((sum, row) => sum + row.byes, 0)).toBe(3);
    expect(snapshot.standings.every((row) => row.fallbackMoves === 0 && row.modelMoves > 0)).toBe(true);
    expect(snapshot.recentGames.every((game) => game.result && game.reason)).toBe(true);

    const saved = JSON.parse(await readFile(join(dir, "state.json"), "utf8"));
    expect(saved.status).toBe("completed");
    expect(saved.games.filter((game: { black: string | null }) => game.black).length).toBe(6);
  });

  it("plays every round-robin game", async () => {
    const players = ["a", "b", "c", "d"].map((name) => contestant(name));
    const runner = new ChessTournamentRunner({ requestMove: firstLegal, stateFile: join(dir, "rr.json") });
    await runner.start({ ...fast, format: "round_robin", maxPlies: 20 }, players);
    await runner.idle();
    const snapshot = (await runner.snapshot())!;
    expect(snapshot.status).toBe("completed");
    expect(snapshot.totals.finished).toBe(6);
    expect(snapshot.standings.every((row) => row.games === 3)).toBe(true);
  });

  it("adjudicates on material at the ply cap", async () => {
    const script: Record<string, string[]> = {
      white: ["e2e4", "d1h5", "h5f7"],
      black: ["e7e5", "b8c6", "e8f7"],
    };
    const scripted: ChessMoveRequester = async ({ contestant: player }) => ({
      text: JSON.stringify({ move: script[player.modelName]!.shift() }),
    });
    const runner = new ChessTournamentRunner({ requestMove: scripted, stateFile: join(dir, "adj.json") });
    await runner.start({ ...fast, rounds: 1, maxPlies: 6 }, [contestant("white"), contestant("black")]);
    await runner.idle();
    const game = (await runner.snapshot())!.recentGames[0]!;
    // White gave up the queen for a pawn: Black is 8 points ahead.
    const whiteIsWhite = game.white === "codex/white@low";
    expect(game.reason).toBe("adjudication");
    expect(game.result).toBe(whiteIsWhite ? "0-1" : "1-0");
  });

  it("retries an illegal answer once and counts it", async () => {
    let calls = 0;
    const flaky: ChessMoveRequester = async (request) => {
      calls += 1;
      if (calls === 1) return { text: '{"move":"e2e5"}' };
      return firstLegal(request);
    };
    const runner = new ChessTournamentRunner({ requestMove: flaky, stateFile: join(dir, "illegal.json") });
    await runner.start({ ...fast, rounds: 1, maxPlies: 4 }, [contestant("a"), contestant("b")]);
    await runner.idle();
    const rows = (await runner.snapshot())!.standings;
    expect(rows.reduce((sum, row) => sum + row.illegalReplies, 0)).toBe(1);
    expect(rows.reduce((sum, row) => sum + row.fallbackMoves, 0)).toBe(0);
  });

  it("plays random moves for a failing provider and forfeits on the third strike", async () => {
    const broken: ChessMoveRequester = async (request: ChessMoveRequest) => {
      if (request.contestant.modelName === "broken") throw new Error("HTTP 503");
      return firstLegal(request);
    };
    const runner = new ChessTournamentRunner({ requestMove: broken, stateFile: join(dir, "forfeit.json") });
    await runner.start({ ...fast, rounds: 1 }, [contestant("broken"), contestant("healthy")]);
    await runner.idle();
    const snapshot = (await runner.snapshot())!;
    const game = snapshot.recentGames[0]!;
    expect(game.reason).toBe("forfeit");
    const brokenRow = snapshot.standings.find((row) => row.contestant.modelName === "broken")!;
    expect(brokenRow.forfeits).toBe(1);
    expect(brokenRow.losses).toBe(1);
    // Three failed moves: two random moves played, the third forfeits.
    expect(brokenRow.fallbackMoves).toBe(3);
    expect(snapshot.standings[0]!.contestant.modelName).toBe("healthy");
    expect(snapshot.standings[0]!.elo).toBeGreaterThan(1500);
  });

  it("retries a transient provider error once before it costs a strike", async () => {
    let calls = 0;
    const busy: ChessMoveRequester = async (request) => {
      calls += 1;
      if (calls === 1) throw new Error("Codex-LB HTTP 503");
      return firstLegal(request);
    };
    const runner = new ChessTournamentRunner({ requestMove: busy, stateFile: join(dir, "busy.json") });
    await runner.start({ ...fast, rounds: 1, maxPlies: 4 }, [contestant("a"), contestant("b")]);
    await runner.idle();
    const rows = (await runner.snapshot())!.standings;
    expect(rows.reduce((sum, row) => sum + row.fallbackMoves, 0)).toBe(0);
    expect(rows.reduce((sum, row) => sum + row.modelMoves, 0)).toBe(4);
  });

  it("keeps requests per provider within the limit while games run in parallel", async () => {
    let inFlight = 0;
    let peak = 0;
    const counted: ChessMoveRequester = async (request) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 2));
      inFlight -= 1;
      return firstLegal(request);
    };
    const runner = new ChessTournamentRunner({ requestMove: counted, stateFile: join(dir, "slots.json"), providerLimits: { codex: 2 } });
    const players = ["a", "b", "c", "d", "e", "f"].map((name) => contestant(name));
    await runner.start({ ...fast, rounds: 1, maxPlies: 6, concurrency: 3 }, players);
    await runner.idle();
    expect((await runner.snapshot())!.totals.finished).toBe(3);
    expect(peak).toBe(2);
  });

  it("hands provider slots over in order and drops aborted waiters", async () => {
    const slots = new ProviderSlots(1);
    const releaseFirst = await slots.acquire(new AbortController().signal);
    const aborted = new AbortController();
    const abandoned = slots.acquire(aborted.signal);
    const next = slots.acquire(new AbortController().signal);
    aborted.abort();
    await expect(abandoned).rejects.toThrow();
    releaseFirst();
    const releaseNext = await next;
    expect(slots.inUse).toBe(1);
    releaseNext();
    releaseNext();
    expect(slots.inUse).toBe(0);
  });

  it("stops, keeps unfinished games pending and resumes to completion", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let held = true;
    const slow: ChessMoveRequester = async (request) => {
      if (held) {
        await new Promise<void>((resolve, reject) => {
          request.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
          void gate.then(resolve);
        });
      }
      return firstLegal(request);
    };
    const file = join(dir, "resume.json");
    const runner = new ChessTournamentRunner({ requestMove: slow, stateFile: file });
    await runner.start({ ...fast, rounds: 1, maxPlies: 10 }, [contestant("a"), contestant("b")]);
    for (let wait = 0; wait < 200 && (await runner.snapshot())!.liveGames.length === 0; wait += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect((await runner.snapshot())!.liveGames).toHaveLength(1);

    await runner.stop();
    let snapshot = (await runner.snapshot())!;
    expect(snapshot.status).toBe("stopped");
    expect(snapshot.totals.pending).toBe(1);
    expect(snapshot.liveGames).toHaveLength(0);

    held = false;
    release();
    await runner.resume();
    await runner.idle();
    snapshot = (await runner.snapshot())!;
    expect(snapshot.status).toBe("completed");
    expect(snapshot.totals.finished).toBe(1);
  });

  it("marks a tournament that was running at restart as interrupted", async () => {
    const file = join(dir, "restart.json");
    const runner = new ChessTournamentRunner({ requestMove: firstLegal, stateFile: file });
    await runner.start({ ...fast, rounds: 1, maxPlies: 4 }, [contestant("a"), contestant("b")]);
    await runner.idle();
    const saved = JSON.parse(await readFile(file, "utf8"));
    saved.status = "running";
    saved.games[0].status = "running";
    saved.games[0].san = ["e4"];
    await writeFile(file, JSON.stringify(saved));

    const restarted = new ChessTournamentRunner({ requestMove: firstLegal, stateFile: file });
    const snapshot = (await restarted.snapshot())!;
    expect(snapshot.status).toBe("interrupted");
    expect(snapshot.totals.pending).toBe(1);
    expect(snapshot.totals.plies).toBe(0);
  });
});

describe("chess benchmark routes", () => {
  async function app(role: "ADMIN" | "USER" = "ADMIN") {
    const fastify = (await import("fastify")).default();
    fastify.decorateRequest("user", null as never);
    fastify.addHook("onRequest", async (request) => {
      (request as { user: unknown }).user = { id: "user:test", email: "t@example.com", role };
    });
    const players = ["a", "b", "c"].map((name) => contestant(name));
    registerChessBenchmarkRoutes(fastify, {}, {
      stateFile: join(dir, "routes.json"),
      requestMove: firstLegal,
      loadContestants: async () => ({
        contestants: players,
        providers: [{ id: "codex", name: "Codex", available: true, count: players.length, requestLimit: 4 }],
        generatedAt: new Date().toISOString(),
      }),
    });
    return fastify;
  }

  it("only lets admins start a tournament", async () => {
    const fastify = await app("USER");
    const response = await fastify.inject({
      method: "POST",
      url: "/api/chess/benchmark/tournament/start",
      payload: { contestantIds: ["codex/a@low", "codex/b@low"] },
    });
    expect(response.statusCode).toBe(403);
    await fastify.close();
  });

  it("validates settings and contestants against the live catalog", async () => {
    const fastify = await app();
    const invalid = await fastify.inject({
      method: "POST",
      url: "/api/chess/benchmark/tournament/start",
      payload: { contestantIds: ["codex/a@low", "codex/b@low"], moveTimeoutMs: 10 },
    });
    expect(invalid.statusCode).toBe(400);
    const unknown = await fastify.inject({
      method: "POST",
      url: "/api/chess/benchmark/tournament/start",
      payload: { contestantIds: ["codex/a@low", "openrouter/evil@default"] },
    });
    expect(unknown.statusCode).toBe(400);
    expect(unknown.json().error.code).toBe("UNKNOWN_CONTESTANTS");
    await fastify.close();
  });

  it("checks providers in the background and reports the result in the catalog", async () => {
    const fastify = await app();
    const started = await fastify.inject({ method: "POST", url: "/api/chess/benchmark/providers/check" });
    expect(started.statusCode).toBe(202);
    let catalog = started.json();
    for (let wait = 0; wait < 100 && catalog.checking; wait += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      catalog = (await fastify.inject({ method: "GET", url: "/api/chess/benchmark/contestants" })).json();
    }
    expect(catalog.checking).toBe(false);
    expect(catalog.providers[0].check).toMatchObject({ ok: true, error: null });
    await fastify.close();
  });

  it("tries other models before a provider check fails", async () => {
    const fastify = (await import("fastify")).default();
    fastify.decorateRequest("user", null as never);
    fastify.addHook("onRequest", async (request) => {
      (request as { user: unknown }).user = { id: "user:test", email: "t@example.com", role: "ADMIN" };
    });
    const players = ["broken", "works"].map((name) => contestant(name));
    registerChessBenchmarkRoutes(fastify, {}, {
      stateFile: join(dir, "check.json"),
      requestMove: async (request) => {
        if (request.contestant.modelName === "broken") throw new Error("Model is unavailable.");
        return firstLegal(request);
      },
      loadContestants: async () => ({
        contestants: players,
        providers: [{ id: "codex", name: "Codex", available: true, count: 2, requestLimit: 4 }],
        generatedAt: new Date().toISOString(),
      }),
    });
    await fastify.inject({ method: "POST", url: "/api/chess/benchmark/providers/check" });
    let catalog = (await fastify.inject({ method: "GET", url: "/api/chess/benchmark/contestants" })).json();
    for (let wait = 0; wait < 100 && catalog.checking; wait += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      catalog = (await fastify.inject({ method: "GET", url: "/api/chess/benchmark/contestants" })).json();
    }
    expect(catalog.providers[0].check).toMatchObject({ ok: true, contestantId: "codex/works@low" });
    await fastify.close();
  });

  it("starts, reports, refuses a second start and resets", async () => {
    const fastify = await app();
    const started = await fastify.inject({
      method: "POST",
      url: "/api/chess/benchmark/tournament/start",
      payload: { contestantIds: ["codex/a@low", "codex/b@low", "codex/c@low"], format: "round_robin", maxPlies: 20, concurrency: 1 },
    });
    expect(started.statusCode).toBe(200);
    expect(started.json().tournament.standings).toHaveLength(3);

    const again = await fastify.inject({
      method: "POST",
      url: "/api/chess/benchmark/tournament/start",
      payload: { contestantIds: ["codex/a@low", "codex/b@low"] },
    });
    expect([200, 409]).toContain(again.statusCode);

    const stop = await fastify.inject({ method: "POST", url: "/api/chess/benchmark/tournament/stop" });
    expect(stop.statusCode).toBe(200);

    const state = await fastify.inject({ method: "GET", url: "/api/chess/benchmark/tournament" });
    expect(state.statusCode).toBe(200);
    const tournament = state.json().tournament;
    expect(["stopped", "completed"]).toContain(tournament.status);

    const badGame = await fastify.inject({ method: "GET", url: "/api/chess/benchmark/games/..%2Fx" });
    expect(badGame.statusCode).toBe(400);

    const reset = await fastify.inject({ method: "POST", url: "/api/chess/benchmark/tournament/reset" });
    expect(reset.statusCode).toBe(200);
    const empty = await fastify.inject({ method: "GET", url: "/api/chess/benchmark/tournament" });
    expect(empty.json().tournament).toBeNull();
    await fastify.close();
  });
});

describe("chess CLI providers", () => {
  it("turns wrapper model catalogs into model x effort contestants", async () => {
    const { parseCliModelCatalog, CHESS_CLI_PROVIDERS } = await import("../chess/chess-cli.js");
    const { cliContestants, cliModelArgument } = await import("../chess/chess-players.js");
    const spec = (id: string) => CHESS_CLI_PROVIDERS.find((provider) => provider.id === id)!;

    const claude = cliContestants(spec("claude"), parseCliModelCatalog("sonnet\tSonnet\nhaiku\tHaiku\nbad id\tSkipped\nmodel@x\tSkipped\n"));
    expect(claude.map((row) => row.id)).toEqual([
      ...["low", "medium", "high", "xhigh", "max"].map((effort) => `claude/sonnet@${effort}`),
      ...["low", "medium", "high", "xhigh", "max"].map((effort) => `claude/haiku@${effort}`),
    ]);
    expect(cliModelArgument(claude[0]!)).toBe("sonnet");

    const deepseek = cliContestants(
      spec("deepseek"),
      parseCliModelCatalog("deepseek-flash/deepseek-flash\tDeepSeek Flash\tdisabled,low,high,max\thigh\nopenrouter/a/b\tB\tlow\tlow\n")
    );
    expect(deepseek.map((row) => row.reasoningEffort)).toEqual(["disabled", "low", "high", "max"]);
    expect(cliModelArgument(deepseek[0]!)).toBe("deepseek-flash/deepseek-flash");

    // A wrapper that ignores effort gets one contestant per model at the provider default.
    const hermes = cliContestants(spec("hermes"), parseCliModelCatalog("opencode-zen:big-pickle\topencode-zen\tlow,high\n"));
    expect(hermes.map((row) => row.id)).toEqual(["hermes/opencode-zen:big-pickle@default"]);
    expect(cliModelArgument(hermes[0]!)).toBe("opencode-zen:big-pickle");

    const omp = cliContestants(
      spec("omp"),
      parseCliModelCatalog("codex-lb/gpt-6-sol\tGPT-6 Sol\tlow,high\tlow\nopenrouter/x/y\tY\t\t\ngoogle-antigravity/g\tG\tauto\tauto\n")
    );
    expect(omp.map((row) => row.id)).toEqual(["omp/codex-lb/gpt-6-sol@low", "omp/codex-lb/gpt-6-sol@high", "omp/google-antigravity/g@auto"]);
    expect(cliModelArgument(omp[0]!)).toBe("codex-lb/gpt-6-sol");

    const opencode = cliContestants(spec("opencode"), [{ id: "opencode/big-pickle", name: "big-pickle", efforts: [] }]);
    expect(opencode[0]!.id).toBe("opencode/big-pickle@default");
    expect(cliModelArgument(opencode[0]!)).toBe("opencode/big-pickle");
  });

  it("lists every ready CLI runtime and explains the ones that are not", async () => {
    const { createChessCatalog } = await import("../chess/chess-players.js");
    const catalog = createChessCatalog({
      loadCodex: async () => [contestant("gpt-test")],
      loadOpenRouter: async () => [],
      lastGoodDirectory: dir,
      cli: {
        state: async (runtimeId) =>
          runtimeId === "cli:qwen" ? { enabled: false, reason: "Qwen Code has no available tokens/quota." } : { enabled: true, reason: null },
        listModels: async (runtimeId) => {
          if (runtimeId === "cli:claude") return "sonnet\tSonnet\n";
          if (runtimeId === "cli:grok") return "grok-4.7\tgrok-4.7\n";
          throw new Error("catalog failed");
        },
      },
    });
    const loaded = await catalog();
    const providers = Object.fromEntries(loaded.providers.map((provider) => [provider.id, provider]));
    expect(providers.claude).toMatchObject({ available: true, count: 5, requestLimit: 2 });
    expect(providers.grok).toMatchObject({ available: true, count: 1 });
    expect(providers.qwen).toMatchObject({ available: false, note: "Qwen Code has no available tokens/quota." });
    expect(providers.gemini).toMatchObject({ available: false, note: "catalog failed" });
    expect(loaded.contestants.map((row) => row.id)).toContain("claude/sonnet@max");
    expect(loaded.contestants.map((row) => row.id)).toContain("grok/grok-4.7@default");
  });

  it("plays Claude on the signed-in account with the most quota left", async () => {
    const { pickClaudeProfile } = await import("../chess/chess-players.js");
    const account = (id: string, status: string, fiveHour: number | null, weekly: number | null) => ({
      id, status, fiveHourRemainingPercent: fiveHour, weeklyRemainingPercent: weekly,
    });
    expect(
      pickClaudeProfile([
        account("main", "CONNECTED", 0, 100),
        account("lab", "EXPIRED", null, null),
        account("crew", "CONNECTED", 99, 100),
        account("ops", "CONNECTED", 77, 86),
      ])
    ).toBe("crew");
    expect(pickClaudeProfile([account("main", "CONNECTED", 80, 90), account("dev", "CONNECTED", 40, 100)])).toBeNull();
    expect(pickClaudeProfile([account("main", "CONNECTED", 0, 0), account("api", "NOT_CONNECTED", null, null)])).toBeNull();
  });

  it("uses the last saved catalog when a CLI is slow to list its models", async () => {
    const { createChessCatalog } = await import("../chess/chess-players.js");
    await writeFile(join(dir, "cursor-models.last-good.json"), JSON.stringify({ models: "auto\tAuto\n" }));
    const never = new Promise<string>(() => undefined);
    const catalog = createChessCatalog({
      loadCodex: async () => [],
      loadOpenRouter: async () => [],
      cliCatalogDeadlineMs: 20,
      lastGoodDirectory: dir,
      cli: {
        state: async (runtimeId) => (runtimeId === "cli:cursor" || runtimeId === "cli:grok" ? { enabled: true, reason: null } : { enabled: false, reason: "off" }),
        listModels: (runtimeId) => (runtimeId === "cli:cursor" ? never : Promise.reject(new Error("grok catalog failed"))),
      },
    });
    const loaded = await catalog();
    const providers = Object.fromEntries(loaded.providers.map((provider) => [provider.id, provider]));
    expect(providers.cursor).toMatchObject({ available: true, count: 1 });
    // No saved catalog and a failing live one: the provider explains itself.
    expect(providers.grok).toMatchObject({ available: false, note: "grok catalog failed" });
  });

  it("checks a provider with one real opening move", async () => {
    const { checkChessProvider } = await import("../chess/chess-routes.js");
    const ok = await checkChessProvider(contestant("a"), firstLegal);
    expect(ok).toMatchObject({ ok: true, error: null, contestantId: "codex/a@low" });
    const quota = await checkChessProvider(contestant("a"), async () => {
      throw new Error("Claude Code has no available tokens/quota right now.");
    });
    expect(quota).toMatchObject({ ok: false, error: "Claude Code has no available tokens/quota right now." });
    const chatty = await checkChessProvider(contestant("a"), async () => ({ text: "I would rather not play." }));
    expect(chatty).toMatchObject({ ok: false, error: "Answered without a legal move." });
  });
});
