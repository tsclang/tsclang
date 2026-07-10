#include "runtime.h"

typedef enum { Color_Red = 0, Color_Green = 1, Color_Blue = 2 } Color;
static const Color Color_values[] = { Color_Red, Color_Green, Color_Blue };
static const char *Color_names[] = { "Red", "Green", "Blue" };

int main(void) {
    TSC_INIT();
    Color c = Color_Red;
    switch (c) {
        case Color_Red:
            printf("red\n");
            break;
        case Color_Green:
            printf("green\n");
            break;
    }
    return 0;
}
