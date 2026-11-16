#include "runtime.h"

static int32_t _lambda_0_i32(void *_env, int32_t v) {
    return v + 1;
}

static int32_t _lambda_0_i32_adapter(int32_t _p0) {
    return _lambda_0_i32(((void *)0), _p0);
}

typedef struct { bool _done; int32_t _result; bool _ok; int32_t _error; } Promise_i32;

int main(void) {
    TSC_INIT();
    Promise_i32 p = { ._done = true, ._result = (int32_t)42, ._ok = true };
    int32_t _then_0 = _lambda_0_i32_adapter(p._result);
    const Promise_i32 p2 = (Promise_i32){._done = true, ._result = _then_0, ._ok = true};
    printf("%d\n", p2._result);
    return 0;
}
