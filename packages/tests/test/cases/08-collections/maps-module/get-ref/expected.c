#include "runtime.h"

typedef struct { bool has_value; int32_t *value; } opt_ref_i32;

int main(void) {
    TSC_INIT();
    TscMap_string_i32 m = tsc_map_create_string_i32();
    tsc_map_set_string_i32(&m, STR_LIT("a"), 1);
    tsc_map_set_string_i32(&m, STR_LIT("b"), 2);
    opt_ref_i32 v = tsc_map_get_ref_string_i32(&m, STR_LIT("a"));
    if (v.has_value) {
        printf("%d\n", *v.value);
    }
    return 0;
}
