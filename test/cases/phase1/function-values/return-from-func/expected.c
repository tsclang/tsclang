#include "runtime.h"

int32_t increment_i32(int32_t x) {
    return x + 1;
}

int32_t decrement_i32(int32_t x) {
    return x - 1;
}

tsc_closure getOp_bool(bool inc) {
    if (inc) {
        return increment_i32;
    }
    return decrement_i32;
}

int main(void) {
    TSC_INIT();
    tsc_closure op = getOp_bool(true);
    printf("%d\n", ((int32_t (*)(void *, int32_t))op.fn)(op.env, 10));
    return 0;
}
