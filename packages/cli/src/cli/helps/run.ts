export const run = `tsclang run — run a named script from tsc.package.json

USAGE:
  tsclang run [script]

Runs scripts.<name> from the ROOT tsc.package.json through the host shell
(cmd on Windows, sh on Unix). The script's exit code becomes the CLI exit code.
Inside scripts the \`tsclang\` command always invokes this CLI (temp shim in PATH),
so no global install is required.

With no script name, lists the available scripts.

EXAMPLES:
  tsc.package.json:
    "scripts": {
      "dev":   "tsclang build src/main.tsc --watch --emit exec",
      "flash": "tsclang build --build uno --emit flash",
      "test":  "tsclang test"
    }

  tsclang run          # list scripts
  tsclang run dev      # watch + auto-restart the artifact
  tsclang run flash    # build for AVR and flash

Notes:
  - Build events (watch, artifact restart) are handled by build flags
    (--watch, --emit exec, --command); scripts only NAME those commands.
  - Dependency manifests are never read — root tsc.package.json only.`;
