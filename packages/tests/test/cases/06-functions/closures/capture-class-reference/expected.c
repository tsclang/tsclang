#include "runtime.h"

typedef struct { int32_t x; } Box;

static Box b;

static int32_t _lambda_0_i32(void *_env) {
    return b.x;
}

static Box b = {0};

int main(void) {
    TSC_INIT();
    b.x = 1;
    tsc_closure fn = {.env = NULL, .fn = (void*)_lambda_0_i32};
    printf("%d\n", b.x);
    return 0;
}
