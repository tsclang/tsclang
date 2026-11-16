#include "runtime.h"

static bool _lambda_0_bool(void *_env, String *s) {
    return tsc_string_eq((*s), STR_LIT("hello"));
}

static bool _lambda_0_bool_adapter(String * _p0) {
    return _lambda_0_bool(((void *)0), _p0);
}

int main(void) {
    TSC_INIT();
    String _lit_0[] = {STR_LIT("hello"), STR_LIT("world"), STR_LIT("hello")};
    const Array_string arr = {.data = _lit_0, .length = 3, .capacity = 3};
    Array_string filtered = tsc_array_filter_string(arr, _lambda_0_bool_adapter);
    printf("%zu\n", filtered.length);
    tsc_array_free_string(&filtered);
    return 0;
}
