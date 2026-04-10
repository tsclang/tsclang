#include "runtime.h"

typedef struct { void *_data; size_t size; } Map_string_i32;
typedef struct { String key; int32_t value; } MapEntry_string_i32;
typedef struct { MapEntry_string_i32 *data; size_t length; size_t capacity; } Array_MapEntry_string_i32;

int main(void) {
    TSC_INIT();
    Map_string_i32 m = tsc_map_create_string_i32();
    tsc_map_set_string_i32(&m, STR_LIT("a"), 1);
    tsc_map_set_string_i32(&m, STR_LIT("b"), 2);
    const Array_MapEntry_string_i32 entries = tsc_map_entries_string_i32(&m);
    printf("%zu\n", entries.length);
    tsc_map_free_string_i32(&m);
    return 0;
}
