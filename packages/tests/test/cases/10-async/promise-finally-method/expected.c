#include "runtime.h"

static void _lambda_0_void(void) {
    printf("done\n");
}

typedef struct { bool _done; int32_t _result; bool _ok; int32_t _error; } Promise_i32;

int main(void) {
    TSC_INIT();
    const Promise_i32 p = { ._done = true, ._result = 42, ._ok = true };
    _lambda_0_void();
    const Promise_i32 p2 = p;
    printf("%d\n", p2._result);
    return 0;
}
