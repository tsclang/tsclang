#include "runtime.h"

static int32_t counter;

static void _lambda_0_void(void *_env) {
    counter = counter + 1;
}

static int32_t counter = 0;

int32_t read(void) {
    return counter;
}

int main(void) {
    TSC_INIT();
    tsc_closure inc = {.env = NULL, .fn = (void*)_lambda_0_void};
    ((void (*)(void *))inc.fn)(inc.env);
    ((void (*)(void *))inc.fn)(inc.env);
    ((void (*)(void *))inc.fn)(inc.env);
    printf("%d\n", read());
    return 0;
}
