#include "runtime.h"

float add_f64_f64(float a, float b) {
    return a + b;
}

int main(void) {
    TSC_INIT();
    const float x = 1.5f;
    const float y = 2.5f;
    printf("%g\n", (double)add_f64_f64(x, y));
    return 0;
}
