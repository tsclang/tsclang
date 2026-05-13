# Automatic Drop

[← Up](./index.md) | [Next →](./closures.md) | [Previous ←](./scope-constraint.md)

---

The compiler automatically inserts memory deallocation calls (`_free`) at the end of the owner's scope. Manual `free` is neither needed nor provided.

## Basic pattern

Owned variables are freed when they go out of scope:

```typescript
function example(): void {
    let user = new User("Alice");
    let items = new Array<i32>(4);
    items.push(1);
    // ... work ...
}   // user and items are automatically freed
```

```c
void example(void) {
    User* user = NULL;
    Array_i32 items = {0};

    user = User_new(STR_LIT("Alice"));
    items = tsc_array_create_i32(4);
    tsc_array_push_i32(&items, 1);

    // ... work ...

    tsc_array_free_i32(&items);   // auto-inserted
    User_free(user);              // auto-inserted
}
```

## goto cleanup with multiple returns

With several exit points (`throw`, `?`, early `return`) the compiler generates a **single cleanup label**:

```typescript
class MyError extends Error {}

function process(flag: bool): i32 throws MyError {
    let items: Array<i32> = new Array<i32>(4);
    items.push(1);
    if (flag) {
        throw new MyError("bad");
    }
    return items.length as i32;
}
```

```c
typedef struct { TscError _base; } MyError;
typedef struct { bool ok; union { int32_t value; MyError error; }; } Result_i32_MyError;
typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

Result_i32_MyError process_bool(bool flag) {
    Array_i32 items = tsc_array_create_i32(4);
    tsc_array_push_i32(&items, 1);
    if (flag) {
        tsc_array_free_i32(&items);                              // inline free before return
        return (Result_i32_MyError){.ok = false, .error = ...};
    }
    int32_t _ret_0 = (int32_t)items.length;
    tsc_array_free_i32(&items);                                  // normal path cleanup
    return (Result_i32_MyError){.ok = true, .value = _ret_0};
}
```

### Advantage of goto cleanup

N owned variables × M exit points = O(N+M) lines instead of O(N×M):

```c
void process(User* u, Buffer* b, Cache* c) {
    if (!u) goto cleanup;
    if (error1) goto cleanup;
    if (error2) goto cleanup;
    // ... work ...

cleanup:
    if (c) Cache_free(c);    // NULL-check is safe
    if (b) Buffer_free(b);
    if (u) User_free(u);
}
```

## C99: NULL initialization

All owned pointers are declared as `NULL` at the **start of the function**. This allows `goto cleanup` to safely call `_free` — the NULL check will skip uninitialized objects:

```c
void process(void) {
    User* user = NULL;    // declared NULL
    Buffer* buf = NULL;   // declared NULL

    user = User_new();
    if (error) goto cleanup;    // buf still NULL — safe
    buf = Buffer_new();
    if (error2) goto cleanup;

cleanup:
    if (buf) Buffer_free(buf);  // NULL → skip
    if (user) User_free(user);  // non-NULL → free
}
```

In C99 `goto` cannot jump over a variable declaration. Declaring all pointers at the beginning of the block solves this.

## Loop-local variables

Variables created inside a loop receive **inline free** before `goto`:

```typescript
for (let i = 0; i < n; i++) {
    let item = new Item();
    process(item)?;
}
```

```c
for (int i = 0; i < n; i++) {
    Item* item = Item_new();

    Result _r = process(item);
    if (!_r.ok) {
        Item_free(item);       // inline free: loop-local variable
        goto cleanup;          // outer cleanup for function-level vars
    }

    Item_free(item);           // normal path — end of iteration
}
```

The compiler determines the scope of each variable: loop-local gets inline free, function-level goes through cleanup.

## Nested scopes

Variables from inner blocks are freed **before** outer cleanup:

```typescript
let a = new Foo();
{
    let b = new Bar();
    if (fail1) throw ...;    // needs: a + b
}                            // b dies here
let c = new Baz();
if (fail2) throw ...;         // needs: a + c (b already dead)
```

```c
Foo* a = NULL;
Baz* c = NULL;

a = Foo_new();

{
    Bar* b = NULL;
    b = Bar_new();
    if (!r.ok) {
        Bar_free(b);          // inline: b is scope-local
        goto cleanup;         // outer cleanup knows about a (not b)
    }
    Bar_free(b);              // normal exit from nested scope
}

c = Baz_new();
if (!r2.ok) goto cleanup;    // cleanup: a + c (b already dead)

cleanup:
    if (c) Baz_free(c);
    if (a) Foo_free(a);
```

## Move and source zeroing

When ownership is moved, the source pointer is zeroed — prevents double-free:

```typescript
let a = new Node();
a.value = 42;
let b = a;              // move
console.log(b.value);   // ok
```

```c
Node a = {0};
a.value = 42;
Node b = a;             // struct copy — ownership transferred
a = (Node){0};          // source zeroed — prevents double-free
printf("%d\n", b.value);
```

## Result + ARC — discriminant check

`Result<T, E>` is a discriminated union. `_free` always checks which variant is stored:

```c
// generated _free for Result<Shared<User>, Error>
void _free_Result_SharedUser_Error(Result_SharedUser_Error* r) {
    if (r->is_ok) {
        // ok variant — release Shared<User>
        SharedUser_release(r->value.ok);
    } else {
        // error variant — free Error
        Error_free(r->value.err);
    }
}
```

When `?` propagates an error, `T` was never created — no leak. When `Result` is dropped without being consumed — `_free` checks the discriminant and calls the appropriate destructor.

## Summary table

| Case | Behavior |
|--------|-----------|
| Normal scope exit | `_free` for all owned variables |
| Early return / throw | `goto cleanup` — single cleanup point |
| C99 compliance | All owned pointers declared `NULL` at function start |
| Loop-local variables | Inline `_free` before `goto`, then outer cleanup |
| Nested scopes | Scope-local: inline free; outer: via cleanup |
| Move | Source zeroed `(Type){0}` — double-free impossible |
| Result<T, E> drop | `_free` checks discriminant |

## See also

- [Argument Passing](./argument-passing.md) — move when passing owned
- [Scope Constraint](./scope-constraint.md) — lifetime restrictions
- [Error Handling](../06-errors/index.md) — throw, try/catch, `?`
- [Closures](./closures.md) — drop captured values
