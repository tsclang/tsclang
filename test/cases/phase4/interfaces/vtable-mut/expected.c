#include "runtime.h"

typedef struct { void (*increment)(void *self); int32_t (*get)(void *self); } Counter_vtable;
typedef struct { void *self; const Counter_vtable *vtable; } Counter;

typedef struct { int32_t value; } SimpleCounter;

static void SimpleCounter_increment(SimpleCounter *self) {
    self->value += 1;
}

static int32_t SimpleCounter_get(const SimpleCounter *self) {
    return self->value;
}

void tick_mut_Counter(Counter c) {
    c.vtable->increment(c.self);
}

static const Counter_vtable _SimpleCounter_Counter_vtable = {
    .increment = (void (*)(void *))SimpleCounter_increment,
    .get = (int32_t (*)(void *))SimpleCounter_get,
};

int main(void) {
    TSC_INIT();
    SimpleCounter sc = {0};
    sc.value = 0;
    Counter _c_sc = { .self = &sc, .vtable = &_SimpleCounter_Counter_vtable };
    tick_mut_Counter(_c_sc);
    tick_mut_Counter(_c_sc);
    printf("%d\n", SimpleCounter_get(&sc));
    return 0;
}
