# Biblioteca Padrão

[Acima](../index.md) | [Próximo](./globals.md)

---

A biblioteca padrão do TSClang é um conjunto de módulos com o namespace unificado `std/`. Todos os módulos estão disponíveis via `import { ... } from "std/<module>"`.

## Princípios

| Princípio | Descrição |
|-----------|-------------|
| **API Unificada** | Tudo via `std/`, sem separação pública em níveis |
| **Carregamento preguiçoso** | O compilador carrega módulos sob demanda, não analisa todo `std/` na inicialização |
| **Tree-shaking** | Apenas o código utilizado vai para o binário |

```typescript
import { parse } from "std/json"   // ok
import { serve } from "std/net"    // ok
import { Regex } from "std/regex"  // ok
```

Pacotes `@tsc/*` — apenas wrappers C, não módulos da stdlib:

```typescript
import { sqlite3_open } from "@tsc/sqlite3"  // ok — wrapper C
import { parse } from "@tsc/json"            // error — use std/json
```

## Importação curta

Todos os módulos `std/` podem ser importados sem prefixo:

```typescript
import { Thread } from "std/threads"   // forma explícita (recomendada)
import { Thread } from "threads"       // forma curta
```

Ordem de resolução: `./name.tsc` → `std/name` → error.

## Compatibilidade de plataforma

| Módulo | Desktop | Embarcado (ARM) | Embarcado (AVR) | Nota |
|--------|---------|----------------|----------------|------|
| Objetos globais | ✅ | ✅ | ✅ | `console`, `Math`, timers |
| `std/string` | ✅ | ✅ | ✅ | |
| `std/math` | ✅ | ✅ | ✅ | |
| `std/json` | ✅ | ✅ | 🟡 | flash ≥ 16KB |
| `std/regex` | ✅ | ✅ | ✅ | NFA, ≈5KB |
| `std/random` | ✅ | 🟡 | 🟡 | `HardwareRandom` — embarcado com RNG apenas |
| `std/temporal` | ✅ | 🟡 | ✅ | ARM: sem relógio de parede |
| `std/io` | ✅ | ❌ | ❌ | requer heap e SO |
| `std/fs` | ✅ | ❌ | ❌ | requer sistema de arquivos |
| `std/net` | ✅ | ❌ | ❌ | requer stack TCP/IP |
| `std/ws` | ✅ | ❌ | ❌ | sobre `std/net` |
| `std/threads` | ✅ | ❌ | ❌ | requer threads de SO |
| `std/reactive` | ✅ | ❌ | ❌ | sobre `std/threads` |
| `std/hal` | ✅ | ✅ | ✅ | GPIO, UART, SPI, I2C; desktop — mock |
| `std/embedded` | ❌ | ✅ | ✅ | `Volatile<T>`, `pointer<T>`, `HashMap` |
| `std/sync` | ❌ | ✅ | ✅ | atômicos sem SO |
| `std/avr` | ❌ | ✅ | ✅ | específico de AVR |

**Legenda:** ✅ — suporte total, 🟡 — parcial, ❌ — indisponível.

O compilador verifica compatibilidade na importação:

```typescript
// target: avr
import { readFile } from "std/fs"   // error: std/fs não é suportado em AVR
import { gpio } from "std/embedded"  // ok
```

## Subpáginas

| Página | Descrição |
|------|-------------|
| [Objetos globais](./globals.md) | `console`, `Math`, `process`, timers, `performance` |
| [console](./console.md) | Logging: `log`, `error`, `warn`, `time`, `timeEnd`, `assert` |
| [Math](./math.md) | Constantes e funções matemáticas |
| [std/io](./io.md) | Streams: `Reader`, `Writer`, `Stream` |
| [std/fs](./fs.md) | Sistema de arquivos: leitura, escrita, diretórios |
| [std/net](./net.md) | Rede: `fetch`, servidor HTTP, TCP/UDP |
| [std/ws](./ws.md) | WebSocket: cliente e servidor |
| [std/string](./string.md) | Unicode, codificação, formatação |
| [std/json](./json.md) | JSON: `parse` e `stringify` |
| [std/regex](./regex.md) | Expressões regulares NFA |
| [std/hal e embarcado](./hal.md) | HAL, módulos embarcados, `std/random`, `std/temporal`, `std/reactive` |

## Veja também

- [Modelo de memória](../05-memory/index.md) — propriedade, `Ref<T>`, `Mut<T>`
- [Tratamento de erros](../06-errors/index.md) — `throws`, `try`/`catch`
- [Módulos](../08-modules/index.md) — `import`/`export`, `.d.tsc`, native
- [Build](../09-build/index.md) — plataformas, `tsc.package.json`
