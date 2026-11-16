#include "runtime.h"

typedef struct { int32_t value; } Data;

static Data d;

static int32_t _lambda_0_i32(void *_env) {
    return d.value;
}

static Data d = {0};

int main(void) {
    TSC_INIT();
    d.value = 42;
    tsc_closure getVal = {.env = NULL, .fn = (void*)_lambda_0_i32};
    printf("%d\n", ((int32_t (*)(void *))getVal.fn)(getVal.env));
    return 0;
}
