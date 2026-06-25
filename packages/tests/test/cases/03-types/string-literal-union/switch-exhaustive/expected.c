#include "runtime.h"

typedef enum { Dir_north, Dir_south } Dir;
static const char *Dir_values[] = { "north", "south" };

int main(void) {
    TSC_INIT();
    const Dir d = Dir_south;
    switch (d) {
        case Dir_north:
            printf("N\n");
            break;
        case Dir_south:
            printf("S\n");
            break;
    }
    return 0;
}
