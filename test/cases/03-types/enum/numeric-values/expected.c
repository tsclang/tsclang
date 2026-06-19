#include "runtime.h"

typedef enum { Dir_North = 0, Dir_South = 1, Dir_East = 2, Dir_West = 3 } Dir;
static const Dir Dir_values[] = { Dir_North, Dir_South, Dir_East, Dir_West };
static const char *Dir_names[] = { "North", "South", "East", "West" };

int main(void) {
    TSC_INIT();
    const Dir *vals = Dir_values;
    printf("%d\n", (int)vals[0]);
    printf("%d\n", (int)vals[3]);
    return 0;
}
