## Автоматический cleanup (`_free`)

Компилятор автоматически генерирует функцию `ClassName_free(ClassName *self)` для классов, содержащих `string`-поля. Эта функция вызывается при выходе переменной из scope.

**Правила:**
- Генерируется **только** если класс имеет хотя бы одно `string`-поле
- Вызывает `tsc_string_release()` для каждого string-поля
- **Не вызывает** `free(self)` — классы являются stack value types
- Внутренний guard: `if (!self) return;` — безопасен для zero-init переменных

```typescript
class User {
    name: string;
    age: i32;
}
let u = new User("Alice", 30);
// ... использование ...
// конец scope → auto cleanup
```

```c
// генерируемый C:
static void User_free(User *self) {
    if (!self) return;
    tsc_string_release(self->name);
}

int main(void) {
    User u = {0};                      // stack value type
    u = User_new(STR_LIT("Alice"), 30);
    // ... использование ...
    User_free(&u);                     // auto cleanup при выходе из scope
    return 0;
}
```

Для `Arc<T>` cleanup дополнительно вызывает `tsc_arc_release`:

```c
// Arc<User> cleanup:
User_free(user);                       // release string-полей
tsc_arc_release(user);                 // decrement refcount, free если 0
```

---

## Декораторы
