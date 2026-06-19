#include "runtime.h"

int32_t _ext_i32_double(int32_t _self) {
    return _self * 2;
}

int main(void) {
    TSC_INIT();
    const int32_t n = 5;
    printf("%d\n", _ext_i32_double(n));
    return 0;
}
