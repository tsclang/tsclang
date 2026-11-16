#include "runtime.h"

typedef struct { int32_t count; } Counter;

static Counter c;

static void _lambda_0_void(void *_env) {
    c.count = (int32_t)((uint32_t)c.count + (uint32_t)1);
}

static Counter c = {0};

int main(void) {
    TSC_INIT();
    c.count = 0;
    tsc_closure inc = {.env = NULL, .fn = (void*)_lambda_0_void};
    ((void (*)(void *))inc.fn)(inc.env);
    ((void (*)(void *))inc.fn)(inc.env);
    ((void (*)(void *))inc.fn)(inc.env);
    printf("%d\n", c.count);
    return 0;
}
