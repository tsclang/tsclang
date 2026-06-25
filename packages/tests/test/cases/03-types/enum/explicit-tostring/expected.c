#include "runtime.h"

typedef enum { Color_Red = 1, Color_Green = 5, Color_Blue = 10 } Color;
static const Color Color_values[] = { Color_Red, Color_Green, Color_Blue };
static const char *Color_toString(Color v) {
    switch (v) {
        case Color_Red: return "Red";
        case Color_Green: return "Green";
        case Color_Blue: return "Blue";
        default: return "unknown";
    }
}

int main(void) {
    TSC_INIT();
    printf("%s\n", Color_toString(Color_Green));
    printf("%s\n", Color_toString(Color_Red));
    printf("%s\n", Color_toString(Color_Blue));
    return 0;
}
