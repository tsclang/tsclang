#include "runtime.h"

static void _lambda_0_void(void *_env, String *s) {
    printf("%s\n", s->data);
}

static void _lambda_0_void_adapter(String * _p0) {
    _lambda_0_void(((void *)0), _p0);
}

int main(void) {
    TSC_INIT();
    String _lit_0[] = {STR_LIT("hello"), STR_LIT("world")};
    Array_string arr = {.data = _lit_0, .length = 2, .capacity = 2};
    tsc_array_foreach_string(arr, _lambda_0_void_adapter);
    return 0;
}
