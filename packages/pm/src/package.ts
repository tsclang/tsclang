import { Emit, PackageType, DEFAULT_MAIN_FILE } from '@tsclang/shared';

interface FlashConfig {
  programmer: string;
  port: string;
  baud: number;
}

interface PkgBuildSettings {
  main?: string;
  profile?: string;
  mcu?: string;
  outDir: string;
  emit: Emit;
  optimize?: string;
  flash?: FlashConfig;
}

interface PkgBuilds {
  [platform: string]: PkgBuildSettings;
}

interface PkgScripts {
  [name: string]: string;
}

interface Pkg {
  name: string;
  version: string;
  type: PackageType;
  main?: string;
  builds?: PkgBuilds;
  scripts?: PkgScripts;
}

// Manifest presets for `tsclang init`: scripts name build invocations so a
// fresh project is runnable via `tsclang run <script>` out of the box.
export function packageGenerate (name: string, type: PackageType, preset: 'desktop' | 'avr' = 'desktop') {
  let pkg: Pkg = {
    name,
    version: '0.1.0',
    type
  };

  if (type === 'executable' && preset === 'desktop') {
    pkg.main = DEFAULT_MAIN_FILE;
    pkg.builds = {
      desktop: {
        emit: 'binary',
        outDir: 'build/desktop',
        optimize: 'O2'
      }
    };
    pkg.scripts = {
      start: 'tsclang build --emit exec',
      dev: 'tsclang build --watch --emit exec'
    };
  }

  if (type === 'executable' && preset === 'avr') {
    pkg.main = DEFAULT_MAIN_FILE;
    pkg.builds = {
      avr: {
        profile: 'avr',
        mcu: 'atmega328p',
        emit: 'flash',
        outDir: 'build/avr',
        optimize: 'Os',
        flash: {
          programmer: 'arduino',
          port: '/dev/ttyUSB0',
          baud: 115200
        }
      }
    };
    pkg.scripts = {
      flash: 'tsclang build --build avr'
    };
  }

  if (type === 'library') {
    // TSClang library: source entry is index.tsc; .d.tsc declarations are a
    // build artifact (emit "dts"), not a handwritten file.
    pkg.builds = {
      dts: {
        main: 'index.tsc',
        emit: 'dts',
        outDir: 'build/dts'
      }
    };
    pkg.scripts = {
      dts: 'tsclang build --build dts'
    };
  }

  return pkg;
}
