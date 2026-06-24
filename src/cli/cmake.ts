import { join, dirname } from 'path';

export interface ProjectCmakeOptions {
  projectName: string;
  target: string;
  mcu: string | null;
  toolchain: string;
  optimize: string | null;
  mainFile: string;
}

export function generateProjectCmake(opts: ProjectCmakeOptions): string {
  const { projectName, target, mcu, toolchain, optimize, mainFile } = opts;
  const lines: string[] = [
    'cmake_minimum_required(VERSION 3.16)',
    `project(${projectName} C)`,
  ];

  if (target === 'avr') {
    lines.push(`set(CMAKE_C_COMPILER ${toolchain})`);
    if (mcu) {
      lines.push(`set(MCU ${mcu})`);
      lines.push('add_compile_options(-mmcu=${MCU})');
      lines.push('add_link_options(-mmcu=${MCU})');
    }
    if (optimize) lines.push(`add_compile_options(-${optimize})`);
    lines.push(`add_executable(${projectName} ${mainFile})`);
  } else {
    if (toolchain !== 'gcc') lines.push(`set(CMAKE_C_COMPILER ${toolchain})`);
    lines.push('set(CMAKE_C_STANDARD 11)');
    if (optimize) lines.push(`add_compile_options(-${optimize})`);
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
    'set(CMAKE_C_STANDARD 11)',
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
