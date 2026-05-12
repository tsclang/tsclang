#include "runtime.h"

typedef enum { Dir_North = 0, Dir_South = 1, Dir_East = 2, Dir_West = 3 } Dir;
static const Dir Dir_values[] = { Dir_North, Dir_South, Dir_East, Dir_West };
static const char *Dir_names[] = { "North", "South", "East", "West" };

int main(void) {
    TSC_INIT();
    Dir d = Dir_East;
    String s;
    switch (d) {
        case Dir_North: s = STR_LIT("N"); break;
        case Dir_South: s = STR_LIT("S"); break;
        case Dir_East: s = STR_LIT("E"); break;
        case Dir_West: s = STR_LIT("W"); break;
    }
    printf("%s\n", s.data);
    return 0;
}
