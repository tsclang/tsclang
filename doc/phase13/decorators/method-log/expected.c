#include "runtime.h"

typedef struct { int _dummy; } Svc;

static void Svc_run_inner(const Svc *self) {
    (void)self;
    printf("%s\n", "running");
}

static void Svc_run(const Svc *self) {
    printf("%s\n", "before");
    Svc_run_inner(self);
    printf("%s\n", "after");
}

int main(void) {
    TSC_INIT();
    Svc s = {0};
    Svc_run(&s);
    return 0;
}
