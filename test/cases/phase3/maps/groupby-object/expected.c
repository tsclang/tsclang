#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;
typedef struct { String _keys[64]; Array_i32 _vals[64]; size_t size; } TscMap_string_array_i32;

static String _lambda_0_string(int32_t x) {
    return (x % 2 == 0) ? STR_LIT("even") : STR_LIT("odd");
}

int main(void) {
    TSC_INIT();
    int32_t _arr_data_0[] = {1, 2, 3, 4, 5, 6};
    const Array_i32 arr = (Array_i32){.data = _arr_data_0, .length = 6, .capacity = 6};
    const TscMap_string_array_i32 grouped = tsc_map_group_by_i32(arr, _lambda_0_string);
    printf("%zu\n", grouped.size);
    return 0;
}
