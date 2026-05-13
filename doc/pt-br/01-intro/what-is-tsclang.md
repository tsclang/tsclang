# O que é o TSClang

[Acima](./index.md) | [Próximo →](./design-philosophy.md)

---

O TSClang é uma linguagem compilada com sintaxe TypeScript que traduz arquivos `.tsc` em código C legível e gera automaticamente o `CMakeLists.txt`.

## Por Quê

Muitos desenvolvedores migram do TypeScript para C — e isso dói. C carece de um ecossistema decente: sem gerenciador de pacotes, sem compilação cruzada conveniente, sem verificações de segurança de memória embutidas.

O TSClang resolve isso:

- **Sintaxe familiar** — um desenvolvedor TS reconhece os construtos e é imediatamente produtivo
- **Memória segura** — propriedade e verificador de empréstimo em tempo de compilação, sem GC
- **Ecossistema unificado** — dependências, compilação cruzada, builds prontos para uso
- **Saída C legível** — pode ser inspecionada, debugada e combinada com C escrito manualmente

## Para Quê

**Agora:**

- Código de servidor — HTTP, sockets, backends
- Desktop — CLI/TUI, gerenciadores de arquivos, aplicativos de escritório

**Importante:**

- Nível de sistema — drivers, SO
- Embarcado — Arduino, ESP, Raspberry Pi
- Jogos — via OpenGL, DirectX

**Sonho:**

- Multiplataforma — Windows, Linux, Mac, Android, iOS
- Plataformas retrô — ZX Spectrum, NES, Sega, MS-DOS

## Extensão de Arquivo

`.tsc` — arquivo fonte do TSClang.

```typescript
// hello.tsc
console.log("Hello world")
```

Compila para:

```c
// hello.c
#include "runtime.h"
int main(void) {
    tsc_console_log(tsc_string_from_cstr("Hello world"));
    return 0;
}
```

## Veja Também

- [Filosofia de Design](./design-philosophy.md) — três prioridades da linguagem
- [Início Rápido](./quick-start.md) — instalação e primeiro projeto
- [Modelo de Memória](../05-memory/index.md) — propriedade e verificador de empréstimo
