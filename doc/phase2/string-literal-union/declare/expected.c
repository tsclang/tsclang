#include "runtime.h"

typedef enum { Dir_north, Dir_south, Dir_east, Dir_west } Dir;
static const char *Dir_values[] = { "north", "south", "east", "west" };

int main(void) {
    TSC_INIT();
    Dir d = Dir_north;
    printf("%s\n", Dir_values[(int)d]);
    return 0;
}
