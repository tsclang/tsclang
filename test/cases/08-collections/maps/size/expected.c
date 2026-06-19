#include "runtime.h"

int main(void) {
    TSC_INIT();
    TscMap_string_i32 m = tsc_map_create_string_i32();
    tsc_map_set_string_i32(&m, STR_LIT("a"), 1);
    tsc_map_set_string_i32(&m, STR_LIT("b"), 2);
    printf("%zu\n", m.size);
    return 0;
}
