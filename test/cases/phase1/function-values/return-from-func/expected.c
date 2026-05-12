#include "runtime.h"

int32_t increment_i32(int32_t x) {
    return x + 1;
}

int32_t decrement_i32(int32_t x) {
    return x - 1;
}

int32_t (*getOp_bool(bool inc))(int32_t) {
    if (inc) {
        return increment_i32;
    }
    return decrement_i32;
}

int main(void) {
    TSC_INIT();
    int32_t (*op)(int32_t) = getOp_bool(true);
    printf("%d\n", op(10));
    return 0;
}
