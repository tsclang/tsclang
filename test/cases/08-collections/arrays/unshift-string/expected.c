#include "runtime.h"

int main(void) {
    TSC_INIT();
    Array_string arr = {.data = NULL, .length = 0, .capacity = 0};
    tsc_array_unshift_string(&arr, STR_LIT("world"));
    tsc_array_unshift_string(&arr, STR_LIT("hello"));
    printf("%zu\n", arr.length);
    printf("%s\n", tsc_array_get_checked_string(arr, 0).data);
    return 0;
}
