#include "runtime.h"

static int32_t _nested_1_helper(void *_env, int32_t x) {
    return x * 2;
}

void _tsc_main(void) {
    tsc_closure helper = {.env = NULL, .fn = (void*)_nested_1_helper};
    printf("%d\n", ((int32_t (*)(void *, int32_t))helper.fn)(helper.env, 21));
}

int main(void) {
    TSC_INIT();
    _tsc_main();
    return 0;
}
