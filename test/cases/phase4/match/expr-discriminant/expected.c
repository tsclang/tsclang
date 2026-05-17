#include "runtime.h"

typedef enum { Color_Red = 0, Color_Green = 1, Color_Blue = 2 } Color;
static const Color Color_values[] = { Color_Red, Color_Green, Color_Blue };
static const char *Color_names[] = { "Red", "Green", "Blue" };

Color getColor(void) {
    return Color_Green;
}

int main(void) {
    TSC_INIT();
    String name;
    Color _tsc_disc_0 = getColor();
    if (_tsc_disc_0 == Color_Red) { name = STR_LIT("red"); }
    else if (_tsc_disc_0 == Color_Green) { name = STR_LIT("green"); }
    else { name = STR_LIT("blue"); }
    printf("%s\n", name.data);
    return 0;
}
