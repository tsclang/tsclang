#include "runtime.h"

typedef enum { Dir_north, Dir_south } Dir;
static const char *Dir_values[] = { "north", "south" };

int main(void) {
    TSC_INIT();
    const Dir d = Dir_north;
    printf("%s\n", Dir_values[(int)d]);
    return 0;
}
