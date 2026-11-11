// Keys allowed inside a `builds.<name>` preset — the single source for the
// config validator (project manifests) and the platform-section validator
// (`platform.builds` presets shipped by platform packages).
export const VALID_BUILD_KEYS = new Set<string>([
  'target', 'mcu', 'toolchain', 'toolchainFile', 'arch',
  'emit', 'linkerScript', 'frequency', 'freq', 'allocator', 'debug',
  // keys that the build command reads from builds.<name> (#239): the validator
  // must not reject manifests the build command itself honors
  'profile', 'optimize', 'outDir', 'defaultNumber', 'flash', 'main',
  // post-build hook: shell command from the ROOT manifest only (see spec 13-build)
  'command',
]);
