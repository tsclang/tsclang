#include "runtime.h"

typedef enum { a_Color_Red = 0, a_Color_Green = 1, a_Color_Blue = 2 } a_Color;
static const a_Color a_Color_values[] = { a_Color_Red, a_Color_Green, a_Color_Blue };
static const char *a_Color_names[] = { "Red", "Green", "Blue" };

typedef enum { b_Color_Red = 10, b_Color_Green = 20, b_Color_Blue = 30 } b_Color;
static const b_Color b_Color_values[] = { b_Color_Red, b_Color_Green, b_Color_Blue };
static const char *b_Color_toString(b_Color v) {
    switch (v) {
        case b_Color_Red: return "Red";
        case b_Color_Green: return "Green";
        case b_Color_Blue: return "Blue";
        default: return "unknown";
    }
}

int main(void) {
    TSC_INIT();
    printf("%d\n", (int)a_Color_Red);
    printf("%d\n", (int)b_Color_Red);
    return 0;
}
