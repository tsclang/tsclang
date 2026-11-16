#include "runtime.h"

static int32_t _nested_1_fact(void *_env, int32_t n);

static int32_t _nested_1_fact(void *_env, int32_t n) {
    tsc_closure fact = {.env = NULL, .fn = (void*)_nested_1_fact};
    return (n <= 1) ? 1 : (int32_t)((uint32_t)n * (uint32_t)((int32_t (*)(void *, int32_t))fact.fn)(fact.env, n - 1));
}

void _tsc_main(void) {
    tsc_closure fact = {.env = NULL, .fn = (void*)_nested_1_fact};
    printf("%d\n", ((int32_t (*)(void *, int32_t))fact.fn)(fact.env, 5));
}

int main(void) {
    TSC_INIT();
    _tsc_main();
    return 0;
}
