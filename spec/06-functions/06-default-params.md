## Дефолтные параметры

Работают для функций, методов и конструкторов. На callsite компилятор подставляет дефолтное значение:

```typescript
function greet(name: string, greeting: string = "Hello"): string {
    return `${greeting}, ${name}!`;
}

greet("Alice");          // "Hello, Alice!"
greet("Alice", "Hi");    // "Hi, Alice!"

// методы
class Printer {
    print(text: string, times: i32 = 1): void { ... }
}

printer.print("hi");     // times=1
printer.print("hi", 3);  // times=3
```

- Дефолтные параметры должны быть в конце списка
- Дефолтное значение — константа или литерал, не выражение с побочными эффектами
- Запрещено иметь overload, сигнатура которого совпадает с вызовом другого overload при подстановке дефолтных значений — ошибка компилятора:

```typescript
function foo(x: i32, y: i32 = 0): void { ... }
function foo(x: i32): void { ... }
// ошибка: ambiguous overload — foo(x: i32) совпадает с foo(x: i32, y: i32 = 0) при y=0
```
