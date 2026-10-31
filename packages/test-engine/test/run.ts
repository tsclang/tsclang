// Test-engine self-tests entry point
// Run: pnpm tsx packages/test-engine/test/run.ts  (from repo root)
import "./pipeline.test"
import "./diagnostics.test"
import "./file-param.test"
import { printSummary } from "../src/engine.ts"

printSummary()
