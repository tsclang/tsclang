import { join, dirname } from 'path';
import { C_STANDARD } from '@tsclang/shared';

export interface ProjectCmakeOptions {
  projectName: string;
  target: string;
  mcu: string | null;
  toolchain: string;
  optimize: string | null;
  mainFile: string;
  /** Profile capability `toolchainFile` — applied before project() so it
   * takes effect (#271). */
  toolchainFile?: string;
  /** Profile capability `include` — extra header dirs (#271). */
  includeDirs?: string[];
}

// quoted cmake path literal with forward slashes — identical output on every
// OS (cmake accepts / on Windows; \\ escapes would vary the generated text)
const cmakePath = (p: string): string => JSON.stringify(p.replace(/\\/g, '/'));

export function generateProjectCmake(opts: ProjectCmakeOptions): string {
  const { projectName, target, mcu, toolchain, optimize, mainFile, toolchainFile, includeDirs } = opts;
  const lines: string[] = [
    'cmake_minimum_required(VERSION 3.16)',
  ];
  if (toolchainFile) lines.push(`set(CMAKE_TOOLCHAIN_FILE ${cmakePath(toolchainFile)})`);
  lines.push(`project(${projectName} C)`);

  if (target === 'avr') {
    lines.push(`set(CMAKE_C_COMPILER ${toolchain})`);
    if (mcu) {
      lines.push(`set(MCU ${mcu})`);
      lines.push('add_compile_options(-mmcu=${MCU})');
      lines.push('add_link_options(-mmcu=${MCU})');
    }
    if (optimize) lines.push(`add_compile_options(-${optimize})`);
    if (includeDirs?.length) lines.push(`include_directories(${includeDirs.map(cmakePath).join(' ')})`);
    lines.push(`add_executable(${projectName} ${mainFile})`);
  } else {
    // #282: the compiler is always stated explicitly — a CMakeLists that
    // silently inherits whatever the system cmake finds is a hidden toolchain
    lines.push(`set(CMAKE_C_COMPILER ${toolchain})`);
    lines.push(`set(CMAKE_C_STANDARD ${C_STANDARD})`);
    lines.push('set(CMAKE_C_STANDARD_REQUIRED ON)');
    if (optimize) lines.push(`add_compile_options(-${optimize})`);
    if (includeDirs?.length) lines.push(`include_directories(${includeDirs.map(cmakePath).join(' ')})`);
    lines.push(`add_executable(${projectName} ${mainFile})`);
  }

  return lines.join('\n') + '\n';
}

export interface BuildCmakeOptions {
  stem: string;
  runtimeDir: string;
  useLibuv: boolean;
}

export function generateBuildCmake(opts: BuildCmakeOptions): string {
  const { stem, runtimeDir, useLibuv } = opts;
  const lines: string[] = [
    'cmake_minimum_required(VERSION 3.10)',
    `project(${stem} C)`,
    `set(CMAKE_C_STANDARD ${C_STANDARD})`,
    'set(CMAKE_C_STANDARD_REQUIRED ON)',
    `add_executable(${stem} ${stem}.c)`,
    `target_include_directories(${stem} PRIVATE ${JSON.stringify(runtimeDir)})`,
  ];

  if (useLibuv) {
    lines.push('find_package(PkgConfig REQUIRED)');
    lines.push('pkg_check_modules(LIBUV REQUIRED libuv)');
    lines.push(`target_link_libraries(${stem} \${LIBUV_LIBRARIES})`);
    lines.push(`target_include_directories(${stem} PRIVATE \${LIBUV_INCLUDE_DIRS})`);
  }

  lines.push('');
  return lines.join('\n');
}
