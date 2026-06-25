#include "runtime.h"

float angle_f32(float deg) {
    return deg * 3.14159 / 180.0;
}

int main(void) {
    TSC_INIT();
    return 0;
}
