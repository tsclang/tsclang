#include "runtime.h"

typedef enum { Axis_X = 0, Axis_Y = 1, Axis_Z = 2 } Axis;
static const Axis Axis_values[] = { Axis_X, Axis_Y, Axis_Z };
static const char *Axis_names[] = { "X", "Y", "Z" };
typedef struct { double X; double Y; double Z; } P3;

int main(void) {
    TSC_INIT();
    const P3 p = { .X = 1.0, .Y = 2.0, .Z = 3.0 };
    printf("%g\n", p.Z);
    return 0;
}
