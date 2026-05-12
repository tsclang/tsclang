#include "runtime.h"

typedef struct { bool has_value; int32_t value; } opt_i32;

int main(void) {
    TSC_INIT();
    TscMap_string_i32 m = tsc_map_create_string_i32();
    tsc_map_set_string_i32(&m, STR_LIT("a"), 10);
    opt_i32 removed = tsc_map_delete_string_i32(&m, STR_LIT("a"));
    printf("%d\n", removed.value);
    printf("%zu\n", m.size);
    return 0;
}
