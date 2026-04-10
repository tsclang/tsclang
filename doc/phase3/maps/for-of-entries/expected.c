#include "runtime.h"

typedef struct { void *_data; size_t size; } Map_string_i32;
typedef struct { String key; int32_t value; } MapEntry_string_i32;
typedef struct { MapEntry_string_i32 *data; size_t length; size_t capacity; } Array_MapEntry_string_i32;

int main(void) {
    TSC_INIT();
    Map_string_i32 m = tsc_map_create_string_i32();
    tsc_map_set_string_i32(&m, STR_LIT("x"), 10);
    tsc_map_set_string_i32(&m, STR_LIT("y"), 20);
    Array_MapEntry_string_i32 _entries_0 = tsc_map_entries_string_i32(&m);
    for (size_t _i_0 = 0; _i_0 < _entries_0.length; _i_0++) {
        const String k = _entries_0.data[_i_0].key;
        const int32_t v = _entries_0.data[_i_0].value;
        printf("%s\n", k.data);
        printf("%d\n", v);
    }
    tsc_map_free_string_i32(&m);
    return 0;
}
