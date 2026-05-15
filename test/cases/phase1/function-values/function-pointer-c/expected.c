#include "runtime.h"

typedef struct { tsc_closure *data; size_t length; size_t capacity; } Array_tsc_closure;

int32_t square_i32(int32_t x) {
    return x * x;
}

int main(void) {
    TSC_INIT();
    tsc_closure _fns_lit[] = {(tsc_closure){.env = NULL, .fn = (void*)square_i32}};
    const Array_tsc_closure fns = {.data = _fns_lit, .length = 1, .capacity = 1};
    printf("%d\n", ((int32_t (*)(int32_t))fns.data[0].fn)(4));
    return 0;
}
