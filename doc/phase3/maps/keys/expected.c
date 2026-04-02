#include "runtime.h"

typedef struct { void *_data; size_t size; } Map_string_i32;
typedef struct { String *data; size_t length; size_t capacity; } Array_string;

int main(void) {
    TSC_INIT();
    Map_string_i32 m = tsc_map_create_string_i32();
    tsc_map_set_string_i32(&m, STR_LIT("a"), 1);
    tsc_map_set_string_i32(&m, STR_LIT("b"), 2);
    Array_string ks = tsc_map_keys_string_i32(&m);
    printf("%zu\n", ks.length);
    tsc_map_free_string_i32(&m);
    return 0;
}
