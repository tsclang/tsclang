#include "runtime.h"

static bool _lambda_0_bool(void *_env, String *s) {
    return s->length > 5;
}

static bool _lambda_0_bool_adapter(String * _p0) {
    return _lambda_0_bool(((void *)0), _p0);
}

int main(void) {
    TSC_INIT();
    String _lit_0[] = {STR_LIT("apple"), STR_LIT("banana"), STR_LIT("cherry"), STR_LIT("date")};
    Array_string arr = {.data = _lit_0, .length = 4, .capacity = 4};
    Array_string filtered = tsc_array_filter_string(arr, _lambda_0_bool_adapter);
    printf("%zu\n", filtered.length);
    tsc_array_free_string(&filtered);
    return 0;
}
