#include "runtime.h"

typedef enum { Dir_North = 0, Dir_South = 1 } Dir;
static const Dir Dir_values[] = { Dir_North, Dir_South };
static const char *Dir_names[] = { "North", "South" };

int main(void) {
    TSC_INIT();
    Dir d = Dir_South;
    switch (d) {
        case Dir_North:
            printf("%s\n", "N");
            break;
        case Dir_South:
            printf("%s\n", "S");
            break;
    }
    return 0;
}
