#include "runtime.h"

static bool _lambda_0_bool(void *_env, String *s) {
    return s->length > 3;
}

static bool _lambda_0_bool_adapter(String * _p0) {
    return _lambda_0_bool(((void *)0), _p0);
}

int main(void) {
    TSC_INIT();
    String _lit_0[] = {STR_LIT("hi"), STR_LIT("hello"), STR_LIT("hey")};
    Array_string arr = {.data = _lit_0, .length = 3, .capacity = 3};
    Array_string result = tsc_array_filter_string(arr, _lambda_0_bool_adapter);
    printf("%zu\n", result.length);
    tsc_array_free_string(&result);
    return 0;
}
