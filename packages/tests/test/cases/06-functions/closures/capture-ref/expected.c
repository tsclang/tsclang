#include "runtime.h"

typedef struct { int32_t value; } Box;

static Box b;

static int32_t _lambda_0_i32(void *_env) {
    return b.value;
}

static Box b = {0};

int main(void) {
    TSC_INIT();
    b.value = 10;
    tsc_closure fn = {.env = NULL, .fn = (void*)_lambda_0_i32};
    printf("%d\n", ((int32_t (*)(void *))fn.fn)(fn.env));
    return 0;
}
