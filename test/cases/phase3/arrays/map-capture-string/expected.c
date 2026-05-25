#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;
typedef struct { double *data; size_t length; size_t capacity; } Array_f64;

typedef struct { int32_t factor; } _closure_0_env;

static int32_t _closure_0_fn(_closure_0_env *env, int32_t x) {
    return x * env->factor;
}

static _closure_0_env *_tsc_cb_env_0;
static int32_t _closure_0_adapter(int32_t _p0) {
    return _closure_0_fn(_tsc_cb_env_0, _p0);
}

Array_i32 scaleItems_Array_i32_i32(Array_i32 items, int32_t factor) {
    _closure_0_env _cb_env_0 = {.factor = factor};
    _tsc_cb_env_0 = &_cb_env_0;
    return tsc_array_map_i32_i32(items, _closure_0_adapter);
}

int main(void) {
    TSC_INIT();
    double _arr_data_0[] = {1, 2, 3};
    Array_i32 arr = (Array_f64){.data = _arr_data_0, .length = 3, .capacity = 3};
    Array_i32 result = scaleItems_Array_i32_i32(arr, 10);
    printf("%s\n", tsc_array_join_i32(result, STR_LIT(", ")).data);
    return 0;
}
