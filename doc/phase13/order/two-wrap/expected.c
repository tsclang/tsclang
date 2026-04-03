#include "runtime.h"

typedef struct { int _dummy; } Foo;

static void Foo_run_inner(const Foo *self) {
    (void)self;
    printf("%s\n", "run");
}

static void Foo_run_B(const Foo *self) {
    printf("%s\n", "B-before");
    Foo_run_inner(self);
    printf("%s\n", "B-after");
}

static void Foo_run(const Foo *self) {
    printf("%s\n", "A-before");
    Foo_run_B(self);
    printf("%s\n", "A-after");
}

int main(void) {
    TSC_INIT();
    Foo f = {0};
    Foo_run(&f);
    return 0;
}
