#include "runtime.h"

typedef struct { double *data; size_t length; size_t capacity; } Array_f64;

typedef struct { Array_f64 *arr; } _closure_0_env;

static void _closure_0_destroy(void *_env) {
    _closure_0_env *env = (_closure_0_env *)_env;
    free(env);
}

static void _closure_0_fn(_closure_0_env *env) {
    env->arr->data[0] = 9.0;
}

int main(void) {
    TSC_INIT();
    double _arr_data_0[] = {1, 2, 3};
    Array_f64 arr = (Array_f64){.data = _arr_data_0, .length = 3, .capacity = 3};
    _closure_0_env *fn_env = tsc_malloc(sizeof(_closure_0_env));
    *fn_env = (_closure_0_env){.arr = &arr};
    tsc_closure fn = {.env = fn_env, .fn = (void*)_closure_0_fn};
    ((void (*)(void *))fn.fn)(fn.env);
    printf("%s\n", tsc_dtoa((double)(arr.data[0])));
    printf("%s\n", tsc_dtoa((double)(arr.data[1])));
    printf("%s\n", tsc_dtoa((double)(arr.data[2])));
    _closure_0_destroy(fn_env);
    return 0;
}
