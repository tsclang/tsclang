#include "runtime.h"

typedef struct { double *data; size_t length; size_t capacity; } Array_f64;
typedef struct { String _keys[64]; Array_f64 _vals[64]; size_t size; } TscMap_string_array_f64;

static String _lambda_0_string(double x) {
    return (fmod(x, 2) == 0) ? STR_LIT("even") : STR_LIT("odd");
}

int main(void) {
    TSC_INIT();
    double _arr_data_0[] = {1, 2, 3, 4, 5, 6};
    const Array_f64 arr = (Array_f64){.data = _arr_data_0, .length = 6, .capacity = 6};
    const TscMap_string_array_f64 grouped = tsc_map_group_by_f64(arr, _lambda_0_string);
    printf("%zu\n", grouped.size);
    return 0;
}
