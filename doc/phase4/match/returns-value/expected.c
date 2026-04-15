#include "runtime.h"

typedef enum { Color_Red = 0, Color_Green = 1, Color_Blue = 2 } Color;
static const Color Color_values[] = { Color_Red, Color_Green, Color_Blue };
static const char *Color_names[] = { "Red", "Green", "Blue" };

int main(void) {
    TSC_INIT();
    Color c = Color_Green;
    String name;
    if (c == Color_Red) { name = STR_LIT("red"); }
    else if (c == Color_Green) { name = STR_LIT("green"); }
    else { name = STR_LIT("blue"); }
    printf("%s\n", name.data);
    return 0;
}
