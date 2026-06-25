#include "runtime.h"

static void _lambda_0_void(void * v, void * k) {
    printf("%d\n", k);
    printf("%d\n", v);
}

static void _lambda_1_void(int32_t v, String k) {
    printf("%s\n", k.data);
    printf("%d\n", v);
}

int main(void) {
    TSC_INIT();
    TscMap_string_i32 m = tsc_map_create_string_i32();
    tsc_map_set_string_i32(&m, STR_LIT("x"), 1);
    tsc_map_set_string_i32(&m, STR_LIT("y"), 2);
    tsc_map_for_each_string_i32(&m, _lambda_1_void);
    return 0;
}
