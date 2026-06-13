#include "runtime.h"

typedef enum { colors_Color_Red = 0, colors_Color_Green = 1, colors_Color_Blue = 2 } colors_Color;
static const colors_Color colors_Color_values[] = { colors_Color_Red, colors_Color_Green, colors_Color_Blue };
static const char *colors_Color_names[] = { "Red", "Green", "Blue" };

int32_t toHex_Color(colors_Color c) {
    return c;
}

int main(void) {
    TSC_INIT();
    return 0;
}
