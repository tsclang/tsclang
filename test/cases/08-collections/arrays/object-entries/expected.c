#include "runtime.h"

typedef struct { int32_t x; int32_t y; } Point;
typedef struct { int32_t **data; size_t length; size_t capacity; } Array_ref_i32;
typedef struct { String _0; int32_t *_1; } Tuple_string_ref_i32;
typedef struct { Tuple_string_ref_i32 *data; size_t length; size_t capacity; } Array_Tuple_string_ref_i32;

int main(void) {
    TSC_INIT();
    Point p = {0};
    p.x = 10;
    p.y = 20;
    Tuple_string_ref_i32 _entries_0_data[] = {{STR_LIT("x"), &p.x}, {STR_LIT("y"), &p.y}};
    Array_Tuple_string_ref_i32 _entries_0 = {.data = _entries_0_data, .length = 2, .capacity = 2};
    const Array_Tuple_string_ref_i32 entries = _entries_0;
    printf("%zu\n", entries.length);
    return 0;
}
