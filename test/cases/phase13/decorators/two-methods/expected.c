#include "runtime.h"

typedef struct { int _dummy; } Svc;

static void Svc_run_inner(const Svc *self) {
    (void)self;
    printf("run\n");
}

static void Svc_run(const Svc *self) {
    printf("call run\n");
    Svc_run_inner(self);
}

static void Svc_stop_inner(const Svc *self) {
    (void)self;
    printf("stop\n");
}

static void Svc_stop(const Svc *self) {
    printf("call stop\n");
    Svc_stop_inner(self);
}

int main(void) {
    TSC_INIT();
    Svc s = {0};
    Svc_run(&s);
    Svc_stop(&s);
    return 0;
}
