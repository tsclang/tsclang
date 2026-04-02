#include "runtime.h"

typedef struct { int _dummy; } Foo;

static void Foo_greet(const Foo *self) {
    (void)self;
    printf("%s\n", "hello");
}

int main(void) {
    TSC_INIT();
    Foo f = {0};
    Foo_greet(&f);
    return 0;
}
