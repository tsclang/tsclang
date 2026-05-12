#include "runtime.h"

typedef struct { int _dummy; } Foo;

static void Foo_greet_inner(const Foo *self) {
    printf("hello\n");
}

static void Foo_greet(const Foo *self) {
    Foo_greet_inner(self);
}

int main(void) {
    TSC_INIT();
    Foo f = {0};
    Foo_greet(&f);
    return 0;
}
