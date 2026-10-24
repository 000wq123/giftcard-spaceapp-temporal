# Frozen Temporal histories

Run `npm test -w @space/worker` to execute real sandbox tests and replay the committed JSON histories. The replay gate does not regenerate its inputs. A failing replay reports the history filename and the SDK's determinism error.

To deliberately record a new baseline, build the workspace dependencies and run `npm run temporal:record-histories -w @space/worker`. The recorder starts an ephemeral time-skipping server, executes production workflows with synthetic activity stubs, and writes their real histories here. No provider, database, credentials or operator data is used. The pre-patch fixture is recorded by a narrowly scoped source loader that disables only the supervisor patch call; replay always uses unchanged production code.

After the initial baseline, re-record only alongside an explicitly reviewed `patched()` workflow change. Preserve old histories so the old branch remains exercised. Never re-record merely to make a failing replay pass. Review every fixture diff before committing, including workflow types, patch markers, timers, activities and continue-as-new inputs.

The negative replay test inserts an extra timer in a test-only Dot workflow and requires a `DeterminismViolationError`. To check the production gate manually, temporarily insert `await sleep("1 second")` at the start of `dotGoalWorkflow`, run the tests without the recording environment variable, then revert that edit.
