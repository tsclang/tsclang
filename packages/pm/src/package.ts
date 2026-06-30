import { Emit } from "./types/emit.js";
import { PackageType } from "./types/package-type.js";

interface PkgBuildSettings {
  outDir: string;
  emit: Emit;
  optimize: string;
}

interface PkgBuilds {
  [platform: string]: PkgBuildSettings;
}

interface Pkg {
  name: string;
  version: string;
  type: PackageType;
  main?: string;
  builds?: PkgBuilds;
}

export function packageGenerate (name: string, type: PackageType) {
  let pkg: Pkg = { 
    name, 
    version: '0.1.0', 
    type 
  };

  if (type === 'executable') {
    pkg.main = 'src/main.tsc';
    pkg.builds = { 
      desktop: { 
        emit: 'binary', 
        outDir: 'build/desktop', 
        optimize: 'O2' 
      } 
    };
  }

  return pkg;
}
