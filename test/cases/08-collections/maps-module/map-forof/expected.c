#include "runtime.h"

int main(void) {
    TSC_INIT();
    TscMap_string_i32 m = tsc_map_create_string_i32();
    tsc_map_set_string_i32(&m, STR_LIT("x"), 1);
    tsc_map_set_string_i32(&m, STR_LIT("y"), 2);
    for (size_t _i_0 = 0; _i_0 < m.size; _i_0++) {
        const String k = m._keys[_i_0];
        const int32_t v = m._vals[_i_0];
        printf("%s\n", k.data);
        printf("%d\n", v);
    }
    return 0;
}
