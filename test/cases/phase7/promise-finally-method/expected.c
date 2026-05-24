#include "runtime.h"

static void _lambda_0_void(void) {
    printf("done\n");
}

int main(void) {
    TSC_INIT();
    const Promise_i32 p = { ._done = true, ._result = 42, ._ok = true };
    _lambda_0_void();
    const Promise_i32 p2 = p;
    printf("%d\n", p2._result);
    return 0;
}
