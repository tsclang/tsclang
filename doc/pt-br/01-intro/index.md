# Introdução ao TSClang

[Acima](../index.md) | [Próximo →](./what-is-tsclang.md)

---

O TSClang é uma linguagem com sintaxe TypeScript que compila para C.

- **TypeScript como sintaxe** — `let`/`const` familiares, classes, arrow functions, `assíncrono`/`await`
- **C como target de compilação** — código C legível + `CMakeLists.txt` é gerado
- **Rust como modelo de segurança** — propriedade, verificador de empréstimo, `Ref<T>`, `Mut<T>`
- **npm como experiência de ecossistema** — `tsc.package.json`, `tsclang install`, registro de pacotes

## Seções

- [O que é o TSClang](./what-is-tsclang.md) — por que, para quem, casos de uso
- [Filosofia de Design](./design-philosophy.md) — três prioridades: segurança, performance, sintaxe TS
- [Início Rápido](./quick-start.md) — instalação, hello world, compilar e executar
- [CLI](./cli.md) — visão geral dos comandos: `build`, `init`, `lint`, `migrate`, `lsp`

## Veja Também

- [Sintaxe](../02-syntax/index.md) — construtos da linguagem
- [Modelo de Memória](../05-memory/index.md) — propriedade e verificador de empréstimo
