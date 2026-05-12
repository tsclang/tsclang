#include "runtime.h"

typedef enum { Dir_North = 0, Dir_South = 1, Dir_East = 2 } Dir;
static const Dir Dir_values[] = { Dir_North, Dir_South, Dir_East };
static const char *Dir_names[] = { "North", "South", "East" };

int main(void) {
    TSC_INIT();
    Dir d = Dir_East;
    switch (d) {
        case Dir_North:
            printf("N\n");
            break;
    }
    return 0;
}
