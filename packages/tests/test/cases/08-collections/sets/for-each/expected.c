#include "runtime.h"

static void _lambda_0_void(void *_env, void * v) {
    printf("%d\n", v);
}

static void _lambda_1_void(void *_env, int32_t v) {
    printf("%d\n", v);
}

static void _lambda_1_void_adapter(int32_t _p0) {
    _lambda_1_void(((void *)0), _p0);
}

int main(void) {
    TSC_INIT();
    TscSet_i32 s = tsc_set_create_i32();
    tsc_set_add_i32(&s, 1);
    tsc_set_add_i32(&s, 2);
    tsc_set_add_i32(&s, 3);
    tsc_set_for_each_i32(&s, _lambda_1_void_adapter);
    return 0;
}
