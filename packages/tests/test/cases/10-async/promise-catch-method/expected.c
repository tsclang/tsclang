#include "runtime.h"

static int32_t _lambda_0_i32(void *_env, int32_t err) {
    return err + 1;
}

static int32_t _lambda_0_i32_adapter(int32_t _p0) {
    return _lambda_0_i32(((void *)0), _p0);
}

typedef struct { bool _done; int32_t _result; bool _ok; int32_t _error; } Promise_i32;

int main(void) {
    TSC_INIT();
    const Promise_i32 p = { ._done = true, ._result = 42, ._ok = true };
    int32_t _catch_0 = p._ok ? p._result : _lambda_0_i32_adapter(p._error);
    const Promise_i32 p2 = (Promise_i32){._done = true, ._result = _catch_0, ._ok = true};
    printf("%d\n", p2._result);
    return 0;
}
