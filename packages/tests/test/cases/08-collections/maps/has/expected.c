#include "runtime.h"

int main(void) {
    TSC_INIT();
    TscMap_string_i32 m = tsc_map_create_string_i32();
    tsc_map_set_string_i32(&m, STR_LIT("a"), 1);
    printf("%s\n", tsc_map_has_string_i32(&m, STR_LIT("a")) ? "true" : "false");
    printf("%s\n", tsc_map_has_string_i32(&m, STR_LIT("b")) ? "true" : "false");
    return 0;
}
