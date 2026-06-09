#include "runtime.h"

typedef enum { Color_Red = 0, Color_Green = 1, Color_Blue = 2 } Color;
static const Color Color_values[] = { Color_Red, Color_Green, Color_Blue };
static const char *Color_names[] = { "Red", "Green", "Blue" };

int main(void) {
    TSC_INIT();
    Color c = Color_Red;
    double val = {0};
    switch (c) {
        case Color_Red: val = 1; break;
        case Color_Green: val = 2; break;
        case Color_Blue: val = 3; break;
        default: break;
    }
    printf("%g\n", (double)(val));
    return 0;
}
