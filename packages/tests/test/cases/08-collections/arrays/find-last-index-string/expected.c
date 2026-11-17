#include "runtime.h"

static bool _lambda_0_bool(void *_env, String *s) {
    return s->length > 1;
}

static bool _lambda_0_bool_adapter(String * _p0) {
    return _lambda_0_bool(((void *)0), _p0);
}

int main(void) {
    TSC_INIT();
    String _lit_0[] = {STR_LIT("a"), STR_LIT("bb"), STR_LIT("ccc")};
    Array_string arr = {.data = _lit_0, .length = 3, .capacity = 3};
    const int32_t idx = (int)tsc_array_find_last_index_string(arr, _lambda_0_bool_adapter);
    printf("%d\n", idx);
    return 0;
}
