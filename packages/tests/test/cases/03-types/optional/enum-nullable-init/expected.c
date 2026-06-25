#include "runtime.h"

typedef enum { Color_Red = 0, Color_Green = 1, Color_Blue = 2 } Color;
static const Color Color_values[] = { Color_Red, Color_Green, Color_Blue };
static const char *Color_names[] = { "Red", "Green", "Blue" };
typedef struct { bool has_value; Color value; } opt_Color;

int main(void) {
    TSC_INIT();
    opt_Color c = {false, 0};
    printf("%d\n", c.has_value ? (int)c.value : -1);
    return 0;
}
