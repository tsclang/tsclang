#include "runtime.h"

typedef enum { Color_Red = 0, Color_Green = 1, Color_Blue = 2 } Color;
static const Color Color_values[] = { Color_Red, Color_Green, Color_Blue };
static const char *Color_names[] = { "Red", "Green", "Blue" };

int32_t toHex_Color(Color c) {
    return c;
}

int main(void) {
    TSC_INIT();
    return 0;
}
