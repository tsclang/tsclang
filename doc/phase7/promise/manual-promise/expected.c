#include "runtime.h"

typedef struct { bool _done; int32_t _result; bool _ok; } Promise_i32;

static int32_t _lambda_0_i32_result;
static bool _lambda_0_done = false;

static void _lambda_0_resolve(int32_t v) { _lambda_0_i32_result = v; _lambda_0_done = true; }
static void _lambda_0_reject(void) { _lambda_0_done = true; }

int main(void) {
    TSC_INIT();
    _lambda_0_resolve(99);
    Promise_i32 p = { ._done = _lambda_0_done, ._result = _lambda_0_i32_result, ._ok = true };
    return 0;
}
