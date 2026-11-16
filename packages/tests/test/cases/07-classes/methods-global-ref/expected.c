#include "runtime.h"

typedef struct { int32_t v; } C;

static int32_t a = 5;

static int32_t C_get(const C *self) {
    return (int32_t)((uint32_t)a + (uint32_t)self->v);
}

int main(void) {
    TSC_INIT();
    C c = { .v = 0 };
    c.v = 10;
    printf("%d\n", C_get(&c));
    return 0;
}
