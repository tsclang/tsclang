#include "runtime.h"

typedef struct { int _dummy; } Svc;

static Svc Svc_create_inner(void) {
    printf("create\n");
    return {0};
}

static Svc Svc_create() {
    printf("log\n");
    return Svc_create_inner();
}

int main(void) {
    TSC_INIT();
    Svc_create();
    return 0;
}
