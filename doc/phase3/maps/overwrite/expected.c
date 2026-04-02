#include "runtime.h"

typedef struct { void *_data; size_t size; } Map_string_i32;
typedef struct { bool has_value; int32_t value; } opt_i32;

int main(void) {
    TSC_INIT();
    Map_string_i32 m = tsc_map_create_string_i32();
    tsc_map_set_string_i32(&m, STR_LIT("x"), 1);
    tsc_map_set_string_i32(&m, STR_LIT("x"), 99);
    opt_i32 _v_0 = tsc_map_get_string_i32(&m, STR_LIT("x"));
    printf("%d\n", _v_0.value);
    printf("%zu\n", m.size);
    tsc_map_free_string_i32(&m);
    return 0;
}
