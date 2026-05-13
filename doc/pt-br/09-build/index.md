# Sistema de Build

[Acima](../index.md) | [Próximo](./projects.md)

---

O sistema de build do TSClang compila arquivos `.tsc` para C99 e constrói um binário via CMake. Suporta aplicações desktop, bibliotecas, wrappers C para bibliotecas nativas C e targets embarcados (AVR, ARM, plataformas retrô).

## Pipeline

```
src/*.tsc  →  <outDir>/c/*.c + CMakeLists.txt  →  <outDir>/myapp (ou .hex)
              ↑                                    ↑
           tsclang build (transpilar)          cmake + gcc/avr-gcc
```

Estrutura do `outDir`:

```
build/desktop/
  c/              ← .c e .h gerados
  CMakeLists.txt
  myapp           ← binário (emit: binary)

build/avr/
  c/
  CMakeLists.txt
  myapp.hex       ← (emit: hex)
```

## Início Rápido

```bash
npm install -g tsclang   # instalar compilador
tsclang init myapp       # criar projeto
cd myapp
tsclang install          # instalar dependências
tsclang run              # compilar e executar
```

## Tipos de Projeto

| Tipo | Descrição | `"type"` | Ponto de entrada |
|------|-------------|----------|-------------|
| **Executable** | Aplicação | não especificado (padrão) | `"main"` (obrigatório) |
| **Biblioteca TSClang** | Biblioteca TSClang | `"library"` | `index.tsc` (convenção) |
| **C-wrapper** | Wrapper sobre biblioteca C | `"library"` | `index.d.tsc` |
| **Perfil de plataforma** | Perfil de plataforma | `"platform"` | `index.d.tsc` |

## Comandos CLI

| Comando | Alias | Descrição |
|---------|-------|-------------|
| `tsclang init` | — | Criar novo projeto |
| `tsclang build` | `b` | Compilar projeto |
| `tsclang run` | — | Compilar e executar |
| `tsclang dev` | — | Modo watch |
| `tsclang install` | `i` | Instalar dependências |
| `tsclang update` | `u` | Atualizar dependências |
| `tsclang remove` | `r` | Remover dependência |
| `tsclang clean` | `c` | Remover artefatos de build |
| `tsclang lint` | `l` | Verificar formatação |
| `tsclang migrate` | — | Migração TypeScript → TSClang *(roadmap)* |
| `tsclang lsp` | — | Language Server Protocol *(roadmap)* |

## Subpáginas

| Página | Descrição |
|------|-------------|
| [Tipos de Projeto](./projects.md) | Executable, library, C-wrapper, perfil de plataforma |
| [Configuração](./config.md) | Campos de `tsc.package.json`, builds, platformSettings |
| [CLI](./cli.md) | Comandos build, run, init, lint, migrate, lsp |
| [Gerenciador de Pacotes](./packages.md) | install, publish, search, workspaces, lock file |
| [Build Embarcado](./embedded.md) | AVR, ARM, plataformas retrô, binaryMode |
| [CMake](./cmake.md) | CMakeLists.txt, perfis debug/release, otimização |

## Saída C

```c
// build/desktop/c/main.c — gerado de src/main.tsc
#include <stdint.h>
#include <stdio.h>
#include "runtime.h"

int main(void) {
    tsc_init_all();
    printf("Hello world\n");
    return 0;
}
```

## Erros

| Erro | Causa |
|-------|-------|
| `cannot determine entry point` | Campo `"main"` não especificado para executable |
| `unknown target arch '6502'` | Arquitetura desconhecida sem perfil de plataforma |
| `toolchain 'avr-gcc' not found in PATH` | Compilador não instalado |
| `dependency conflict` | Restrições de semver incompatíveis |

## Veja também

- [Módulos: Importação/Exportação](../08-modules/import-export.md) — ponto de entrada e inicialização
- [Memória: Propriedade](../05-memory/ownership-types.md) — owned/borrow durante FFI
- [Concorrência](../07-concurrency/index.md) — runtime assíncrono: libuv, cooperativo, none
