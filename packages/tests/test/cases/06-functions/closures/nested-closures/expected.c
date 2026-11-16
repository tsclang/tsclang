#include "runtime.h"

typedef struct { int32_t count; } Counter;

static Counter c;

static void _lambda_1_void(void *_env) {
    c.count = (int32_t)((uint32_t)c.count + (uint32_t)10);
}

static void _lambda_0_void(void *_env) {
    c.count = (int32_t)((uint32_t)c.count + (uint32_t)1);
    tsc_closure inner = {.env = NULL, .fn = (void*)_lambda_1_void};
    ((void (*)(void *))inner.fn)(inner.env);
}

static Counter c = {0};

int main(void) {
    TSC_INIT();
    c.count = 0;
    tsc_closure outer = {.env = NULL, .fn = (void*)_lambda_0_void};
    ((void (*)(void *))outer.fn)(outer.env);
    printf("%d\n", c.count);
    return 0;
}
