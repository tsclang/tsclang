#include "runtime.h"

typedef struct { int _dummy; } Svc;

static int32_t callCount = 0;

static void Svc_run_inner(const Svc *self) {
    printf("run\n");
}

static void Svc_run(const Svc *self) {
    callCount += 1;
    Svc_run_inner(self);
}

int main(void) {
    TSC_INIT();
    Svc s = {0};
    Svc_run(&s);
    Svc_run(&s);
    printf("%d\n", callCount);
    return 0;
}
