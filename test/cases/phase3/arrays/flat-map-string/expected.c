#include "runtime.h"

typedef struct { Array_string *data; size_t length; size_t capacity; } Array_Array_string;

static Array_string _lambda_0_Array_string(String *s) {
    String *_arr_data_1 = (String*)malloc(2 * sizeof(String));
    _arr_data_1[0] = (*s);
    _arr_data_1[1] = (*s);
    return (Array_string){.data = _arr_data_1, .length = 2, .capacity = 2};
}

int main(void) {
    TSC_INIT();
    String _lit_0[] = {STR_LIT("hi"), STR_LIT("yo")};
    const Array_string arr = {.data = _lit_0, .length = 2, .capacity = 2};
    const Array_Array_string arr2 = tsc_array_flat_map_string_string(arr, _lambda_0_Array_string);
    printf("%zu\n", arr2.length);
    printf("%d\n", arr2.data[0]);
    printf("%d\n", arr2.data[1]);
    return 0;
}
