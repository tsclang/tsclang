#include "runtime.h"

int main(void) {
    TSC_INIT();
    TscMap_string_i32 m = tsc_map_create_string_i32();
    tsc_map_set_string_i32(&m, STR_LIT("x"), 5);
    printf("%d\n", tsc_map_get_string_i32(&m, STR_LIT("x")));
    return 0;
}
