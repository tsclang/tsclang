#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

int main(void) {
    TSC_INIT();
    TscMap_string_i32 m = tsc_map_create_string_i32();
    tsc_map_set_string_i32(&m, STR_LIT("a"), 10);
    tsc_map_set_string_i32(&m, STR_LIT("b"), 20);
    Array_i32 vals = tsc_map_values_string_i32(&m);
    printf("%zu\n", vals.length);
    printf("%d\n", vals.data[0] + vals.data[1]);
    return 0;
}
