// Platform packages suite: manifest platform section, naming rules, registry
// catalog, install/remove ownership, toolchain download plumbing (epic #260).
// Unit tests import source directly; e2e tests spawn dist — `pnpm build` first.
// Run: pnpm tsx packages/tests/test/spec/13-build/platform/run.ts [filter]
import "./platform.test"
import "./platform-registry.test"
import "./platform-install.test"
import "./platform-remove.test"
import "./toolchains.test"
import "./toolchain-resolve.test"
import "./build-env.test"
import "./doctor-platforms.test"
import "./wizard.test"
import "./reference-platform.test"
import "./runtime-header.test"
import { printSummary } from "../../../../../test-engine/src/engine.ts"

printSummary()
