#include "runtime.h"

float lerp_f32_f32_f32(float a, float b, float t) {
    return a + (b - a) * t;
}

int main(void) {
    TSC_INIT();
    float x = lerp_f32_f32_f32(0.0, 1.0, 0.5);
    return 0;
}
