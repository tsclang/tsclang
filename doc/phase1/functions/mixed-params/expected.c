#include "runtime.h"

double mix_i32_f64(int32_t a, double b) {
    return b * a;
}

int main(void) {
    TSC_INIT();
    printf("%g\n", mix_i32_f64(2, 3.5));
    return 0;
}
