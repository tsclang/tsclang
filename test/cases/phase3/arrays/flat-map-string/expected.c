#include "runtime.h"

static Array_string _lambda_0_Array_string(String s) {
    String _arr_data_1[] = {s, s};
    return (Array_string){.data = _arr_data_1, .length = 2, .capacity = 2};
}

int main(void) {
    TSC_INIT();
    String _lit_0[] = {STR_LIT("hi"), STR_LIT("yo")};
    const Array_string arr = {.data = _lit_0, .length = 2, .capacity = 2};
    const Array_string arr2 = tsc_array_flat_map_string_string(arr, _lambda_0_Array_string);
    printf("%zu\n", arr2.length);
    printf("%s\n", arr2.data[0].data);
    printf("%s\n", arr2.data[1].data);
    return 0;
}
