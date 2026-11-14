#include "runtime.h"

typedef enum { Color_Red = 0, Color_Green = 1 } Color;
static const Color Color_values[] = { Color_Red, Color_Green };
static const char *Color_names[] = { "Red", "Green" };

int main(void) {
    TSC_INIT();
    printf("%s\n", (((double)(Color_Red) == tsc_string_to_number(STR_LIT("0")))) ? "true" : "false");
    printf("%s\n", (((double)(Color_Green) == tsc_string_to_number(STR_LIT("1")))) ? "true" : "false");
    return 0;
}
