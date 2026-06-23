## Ограничение: extern "C" запрещает перегрузку *[NOT YET IMPLEMENTED]*

> `extern "C" function` syntax is not yet implemented. Use `declare function` for C interop (provides the same capability with full type checking).

`extern "C"` функции имеют фиксированное C-имя — манглинг невозможен. Перегрузка — ошибка компилятора:

```typescript
// ❌ импорт из C — линковщик не найдёт mangled имена
extern "C" function SDL_SetWindowSize(w: any, width: i32, height: i32): void { ... }
extern "C" function SDL_SetWindowSize(w: any, size: i32): void { ... }
// ошибка: extern "C" функции не могут быть перегружены

// ❌ экспорт в C — C-код ищет символ "process", а не "process_string"
export extern "C" function process(data: string): void { ... }
export extern "C" function process(data: i32): void { ... }
// ошибка: extern "C" функции не могут быть перегружены

// ✅ правильно — разные имена для C, обёртка с перегрузкой внутри TSC
extern "C" function SDL_SetWindowSize(w: any, width: i32, height: i32): void { ... }

export extern "C" function process_str(data: string): void { ... }
export extern "C" function process_int(data: i32): void { ... }

// внутренняя перегрузка — ok
function process(data: string): void { process_str(data); }
function process(data: i32): void { process_int(data); }
```
