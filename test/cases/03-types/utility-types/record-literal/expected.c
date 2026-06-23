#include "runtime.h"

typedef struct { double x; double y; } Coords;

int main(void) {
    TSC_INIT();
    Coords c = { .x = 1.0, .y = 2.0 };
    printf("%s\n", tsc_dtoa((double)(c.x)));
    return 0;
}
