#include "runtime.h"

typedef struct { bool has_value; int32_t value; } opt_i32;

int main(void) {
    TSC_INIT();
    TscMap_string_i32 m = tsc_map_create_string_i32();
    opt_i32 v = tsc_map_get_string_i32(&m, STR_LIT("missing"));
    printf("%s\n", v.has_value ? "some" : "null");
    return 0;
}
