#include "runtime.h"

typedef struct { double *data; size_t length; size_t capacity; } Array_f64;

static Array_f64 arr;

static void _lambda_0_void(void *_env) {
    arr.data[0] = 9.0;
}

static double _arr_data_0[] = {1, 2, 3};
static Array_f64 arr = (Array_f64){.data = _arr_data_0, .length = 3, .capacity = 3};

int main(void) {
    TSC_INIT();
    tsc_closure fn = {.env = NULL, .fn = (void*)_lambda_0_void};
    ((void (*)(void *))fn.fn)(fn.env);
    printf("%s\n", tsc_dtoa((double)(arr.data[0])));
    printf("%s\n", tsc_dtoa((double)(arr.data[1])));
    printf("%s\n", tsc_dtoa((double)(arr.data[2])));
    return 0;
}
