export const doctor = `tsclang doctor — diagnose the environment and the current project

Usage: tsclang doctor [--project] [--tools] [--fix]

Checks the platform, CLI version, the manifest (tsc.package.json) in the
current directory and the recommended toolchains for the project profile
(desktop / embedded / wasm). Offers fixes for missing manifest builds/scripts;
in an interactive terminal asks before changing anything.

Report marks: [ok] fine, [!] fixable problem, [x] missing, [~] optional.
Exit code: 0 when no problems, 1 when a required check fails.

Options:
  --project  check only the project manifest
  --tools    check only the recommended toolchains
  --fix      apply manifest fixes without asking (PATH is never touched)

Environment:
  TSC_DOCTOR_NO_UPDATE=1  skip the npm registry update check`;
