#include "runtime.h"

typedef struct { bool has_value; int32_t *value; } opt_ref_i32;

int main(void) {
    TSC_INIT();
    TscMap_string_i32 m = tsc_map_create_string_i32();
    tsc_map_set_string_i32(&m, STR_LIT("x"), 1);
    tsc_map_set_string_i32(&m, STR_LIT("x"), 99);
    printf("%d\n", tsc_map_get_ref_string_i32(&m, STR_LIT("x")).has_value ? *tsc_map_get_ref_string_i32(&m, STR_LIT("x")).value : -1);
    printf("%zu\n", m.size);
    return 0;
}
