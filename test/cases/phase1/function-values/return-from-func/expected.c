#include "runtime.h"

int32_t increment_i32(int32_t x) {
    return x + 1;
}

int32_t decrement_i32(int32_t x) {
    return x - 1;
}

tsc_closure getOp_bool(bool inc) {
    if (inc) {
        return (tsc_closure){.env = NULL, .fn = (void*)increment_i32};
    }
    return (tsc_closure){.env = NULL, .fn = (void*)decrement_i32};
}

int main(void) {
    TSC_INIT();
    tsc_closure op = getOp_bool(true);
    printf("%d\n", ((int32_t (*)(int32_t))op.fn)(10));
    return 0;
}
