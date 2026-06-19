#include "runtime.h"

static bool _lambda_0_bool(String *s) {
    return tsc_string_eq((*s), STR_LIT("hello"));
}

int main(void) {
    TSC_INIT();
    String _lit_0[] = {STR_LIT("hello"), STR_LIT("world"), STR_LIT("hello")};
    const Array_string arr = {.data = _lit_0, .length = 3, .capacity = 3};
    Array_string filtered = tsc_array_filter_string(arr, _lambda_0_bool);
    printf("%zu\n", filtered.length);
    tsc_array_free_string(&filtered);
    return 0;
}
