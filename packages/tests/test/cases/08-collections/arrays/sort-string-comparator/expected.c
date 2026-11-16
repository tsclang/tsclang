#include "runtime.h"

static size_t _lambda_0_usize(void *_env, String *a, String *b) {
    return a->length - b->length;
}

static size_t _lambda_0_usize_adapter(String * _p0, String * _p1) {
    return _lambda_0_usize(((void *)0), _p0, _p1);
}

int main(void) {
    TSC_INIT();
    String _lit_0[] = {STR_LIT("banana"), STR_LIT("fig"), STR_LIT("apple")};
    Array_string arr = {.data = _lit_0, .length = 3, .capacity = 3};
    tsc_array_sort_string(&arr, _lambda_0_usize_adapter);
    printf("%s\n", arr.data[0].data);
    printf("%s\n", arr.data[1].data);
    printf("%s\n", arr.data[2].data);
    return 0;
}
