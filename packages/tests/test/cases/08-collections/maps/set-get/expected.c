#include "runtime.h"

typedef struct { bool has_value; int32_t *value; } opt_ref_i32;

int main(void) {
    TSC_INIT();
    TscMap_string_i32 m = tsc_map_create_string_i32();
    tsc_map_set_string_i32(&m, STR_LIT("x"), 42);
    opt_ref_i32 v = tsc_map_get_ref_string_i32(&m, STR_LIT("x"));
    printf("%d\n", v.has_value ? *v.value : -1);
    return 0;
}
