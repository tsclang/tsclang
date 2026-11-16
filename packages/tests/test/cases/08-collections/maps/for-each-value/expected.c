#include "runtime.h"

static void _lambda_0_void(void *_env, void * v) {
    printf("%d\n", v);
}

static void _lambda_1_void(void *_env, int32_t v, String _unused_1) {
    printf("%d\n", v);
}

static void _lambda_1_void_adapter(int32_t _p0, String _p1) {
    _lambda_1_void(((void *)0), _p0, _p1);
}

int main(void) {
    TSC_INIT();
    TscMap_string_i32 m = tsc_map_create_string_i32();
    tsc_map_set_string_i32(&m, STR_LIT("x"), 1);
    tsc_map_set_string_i32(&m, STR_LIT("y"), 2);
    tsc_map_for_each_string_i32(&m, _lambda_1_void_adapter);
    return 0;
}
