#include "runtime.h"

static String _lambda_0_string(String *s) {
    tsc_string_retain((*s));
    const String x = (*s);
    return x;
}

int main(void) {
    TSC_INIT();
    String _lit_0[] = {STR_LIT("hello"), STR_LIT("world")};
    const Array_string arr = {.data = _lit_0, .length = 2, .capacity = 2};
    Array_string result = tsc_array_map_string_string(arr, _lambda_0_string);
    printf("%s\n", result.data[0].data);
    printf("%s\n", result.data[1].data);
    tsc_array_free_string(&result);
    return 0;
}
