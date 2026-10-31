// Test-engine self-tests entry point
// Run: pnpm tsx packages/test-engine/test/run.ts  (from repo root)
import "./pipeline.test.ts"
import "./diagnostics.test.ts"
import "./file-param.test.ts"
import "./hooks.test.ts"
import "./expect-matchers.test.ts"
import "./backends.test.ts"
import "./async.test.ts"
import { printSummary } from "../src/engine.ts"

printSummary()
