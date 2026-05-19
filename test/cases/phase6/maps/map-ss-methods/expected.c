#include "runtime.h"

int main(void) {
    TSC_INIT();
    TscMap_string_string m = tsc_map_create_string_string();
    tsc_map_set_string_string(&m, STR_LIT("a"), STR_LIT("apple"));
    tsc_map_set_string_string(&m, STR_LIT("b"), STR_LIT("banana"));
    Array_string keys = tsc_map_keys_string_string(&m);
    printf("%zu\n", keys.length);
    Array_string vals = tsc_map_values_string_string(&m);
    printf("%zu\n", vals.length);
    return 0;
}
