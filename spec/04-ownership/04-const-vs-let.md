## `const` vs `let`

- `const obj` — нельзя вызывать `mut` методы, нельзя передать как `Mut`, нельзя move
- `let obj` — можно всё

```typescript
function foo(c: Mut<Counter>) { c.increment(); }

const c = new Counter();
foo(c);   // ошибка: const нельзя передать как Mut

let c2 = new Counter();
foo(c2);  // ok

// move из const — запрещён
const arr = [user1, user2];
let b = arr;       // ошибка: cannot move out of const
                   // hint: use Shared<T> if shared ownership is needed

const arr2: Shared<User[]> = [user1, user2];
let b2 = arr2;     // ok — retain, не move
```

