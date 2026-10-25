# Frozen Temporal histories

Run `npm test -w @space/worker` to execute real sandbox tests and replay the committed JSON histories. The replay gate does not regenerate its inputs. A failing replay reports the history filename and the SDK's determinism error.

To deliberately record a new baseline, build the workspace dependencies and run `npm run temporal:record-histories -w @space/worker`. The recorder starts an ephemeral time-skipping server, executes production workflows with synthetic activity stubs, and writes their real histories here. No provider, database, credentials or operator data is used. The pre-patch fixture is recorded by a narrowly scoped source loader that disables only the supervisor patch call; replay always uses unchanged production code.

After the initial baseline, re-record only alongside an explicitly reviewed `patched()` workflow change. Preserve old histories so the old branch remains exercised. Never re-record merely to make a failing replay pass. Review every fixture diff before committing, including workflow types, patch markers, timers, activities and continue-as-new inputs.

The recorder refuses to overwrite an existing file. For an approved patched change, use `TEMPORAL_HISTORY_REVISION=your-patch-id npm run temporal:record-histories -w @space/worker` to add versioned histories while retaining the old ones. A revision must be new and contain only letters, digits, underscores or hyphens. The replay gate requires all nine original baselines and replays every JSON file, including later versions. Check in the new histories together with the compatible code change.

The SDK downloads its test-server executable on first use and caches it. After dependencies and that executable are available, workflow activities need no external service: all provider, database and application activity calls are synthetic stubs, and the real Temporal connection is local to the disposable test server.

Provider policy assertions account for the Java test server clamping an activity timeout to its workflow run limit. The timeout-cause regression injects a typed `TimeoutFailure` through an activity's application-failure cause, verifies its real serialized history, and checks the supervisor's persisted cause code. It does not wait for a wall-clock heartbeat deadline; retry counts, durable workflow timers, signals and continuation boundaries are exercised separately on the real server.

The negative replay test inserts an extra timer in a test-only Dot workflow and requires a `DeterminismViolationError`. To check the production gate manually, temporarily insert `await sleep("1 second")` at the start of `dotGoalWorkflow`, run the tests without the recording environment variable, then revert that edit.
