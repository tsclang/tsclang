#include "runtime.h"

int32_t check_i32(int32_t x) {
    return x * 2;
}

int main(void) {
    TSC_INIT();
    return 0;
}
