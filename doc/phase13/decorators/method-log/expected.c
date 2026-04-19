#include "runtime.h"

typedef struct { int _dummy; } Svc;

static void Svc_run_inner(const Svc *self) {
    printf("running\n");
}

static void Svc_run(const Svc *self) {
    printf("before\n");
    Svc_run_inner(self);
    printf("after\n");
}

int main(void) {
    TSC_INIT();
    Svc s = {0};
    Svc_run(&s);
    return 0;
}
