#include "runtime.h"

typedef struct { int _dummy; } Foo;

static void Foo_run_inner(const Foo *self) {
    printf("run\n");
}

static void Foo_run_B(const Foo *self) {
    printf("B-before\n");
    Foo_run_inner(self);
    printf("B-after\n");
}

static void Foo_run(const Foo *self) {
    printf("A-before\n");
    Foo_run_B(self);
    printf("A-after\n");
}

int main(void) {
    TSC_INIT();
    Foo f = {0};
    Foo_run(&f);
    return 0;
}
