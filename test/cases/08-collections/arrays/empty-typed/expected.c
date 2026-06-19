#include "runtime.h"

int main(void) {
    TSC_INIT();
    Array_string a = {.data = NULL, .length = 0, .capacity = 0};
    tsc_array_push_string(&a, STR_LIT("hello"));
    tsc_array_push_string(&a, STR_LIT("world"));
    printf("%zu\n", a.length);
    tsc_array_free_string(&a);
    return 0;
}
