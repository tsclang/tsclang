#include "runtime.h"

static int32_t _nested_1_twice(void *_env, int32_t x) {
    return x * 2;
}

int32_t apply_fn_i32_i32_i32(tsc_closure f, int32_t v) {
    return ((int32_t (*)(void *, int32_t))f.fn)(f.env, v);
}

void _tsc_main(void) {
    tsc_closure twice = {.env = NULL, .fn = (void*)_nested_1_twice};
    printf("%d\n", apply_fn_i32_i32_i32(twice, 21));
}

int main(void) {
    TSC_INIT();
    _tsc_main();
    return 0;
}
