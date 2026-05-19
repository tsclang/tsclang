#include "runtime.h"

static void _lambda_0_void(String s) {
    printf("%s\n", s.data);
}

int main(void) {
    TSC_INIT();
    String _lit_0[] = {STR_LIT("hello"), STR_LIT("world")};
    Array_string arr = {.data = _lit_0, .length = 2, .capacity = 2};
    tsc_array_foreach_string(arr, _lambda_0_void);
    return 0;
}
