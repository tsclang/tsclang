#include "runtime.h"

typedef struct { double x; double y; } Coords;

int main(void) {
    TSC_INIT();
    const Coords c = {.x = 1.0, .y = 2.0};
    printf("%g\n", c.x);
    return 0;
}
