#include "runtime.h"

void foo_i32_f64(int32_t a, double b) {
    printf("ok\n");
}

int main(void) {
    TSC_INIT();
    foo_i32_f64(1, 2.0);
    return 0;
}
