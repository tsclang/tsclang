export const init = `tsclang init — Create a new project

USAGE:
  tsclang init [name] [options]

ARGUMENTS:
  name                          Project name and directory to create.
                                Omitted: initialize the current directory
                                (package name defaults to "myapp").

PRESETS:
  (no flag)                     Executable: tsc.package.json (builds.desktop,
                                scripts start/dev) + src/main.tsc + test/main.test.tsc
  --avr                         Executable for AVR: builds.avr (profile avr,
                                atmega328p, emit flash + flash config) + scripts flash.
                                Edit flash.port/programmer for your board.
  --library, -l                 TSClang library: index.tsc source entry +
                                builds.dts + scripts dts (.d.tsc is generated,
                                not handwritten).
  --declaration, -d             C-wrapper: handwritten index.d.tsc (declare
                                function/const only).
  --platform, -p                Platform profile manifest (advanced, no template).
  --type <executable|library|declaration|platform|package>
                                Explicit type (shorthand flags above win).

Files are never overwritten if they already exist, except tsc.package.json.`;
