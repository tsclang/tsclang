#include "runtime.h"

typedef struct { int _dummy; } Svc;

static void Svc_run_inner(const Svc *self) {
    printf("run\n");
}

static void Svc_run_C(const Svc *self) {
    printf("C-before\n");
    Svc_run_inner(self);
    printf("C-after\n");
}

static void Svc_run_B(const Svc *self) {
    printf("B-before\n");
    Svc_run_C(self);
    printf("B-after\n");
}

static void Svc_run(const Svc *self) {
    printf("A-before\n");
    Svc_run_B(self);
    printf("A-after\n");
}

int main(void) {
    TSC_INIT();
    Svc s = {0};
    Svc_run(&s);
    return 0;
}
