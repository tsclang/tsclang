#include "runtime.h"

static String _lambda_0_string(String *s) {
    return tsc_string_to_upper((*s));
}

int main(void) {
    TSC_INIT();
    String _lit_0[] = {STR_LIT("hello"), STR_LIT("world")};
    const Array_string arr = {.data = _lit_0, .length = 2, .capacity = 2};
    Array_string upper = tsc_array_map_string_string(arr, _lambda_0_string);
    printf("%s\n", upper.data[0].data);
    tsc_array_free_string(&upper);
    return 0;
}
