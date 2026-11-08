#include "runtime.h"

typedef struct { int32_t v; } Foo;

int main(void) {
    TSC_INIT();
    printf("%d\n", ((Foo){ .v = 3 }).v);
    return 0;
}
