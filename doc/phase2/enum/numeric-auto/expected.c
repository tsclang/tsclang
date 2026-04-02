#include "runtime.h"

typedef enum { Direction_North = 0, Direction_East = 1, Direction_South = 2, Direction_West = 3 } Direction;
static const Direction Direction_values[] = { Direction_North, Direction_East, Direction_South, Direction_West };
static const char *Direction_names[] = { "North", "East", "South", "West" };

int main(void) {
    TSC_INIT();
    printf("%d\n", (int)Direction_North);
    printf("%d\n", (int)Direction_West);
    return 0;
}
