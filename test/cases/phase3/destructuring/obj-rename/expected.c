#include "runtime.h"

typedef struct { double x; double y; } Pt;

int main(void) {
    TSC_INIT();
    Pt p = {0};
    p.x = 1.0;
    p.y = 2.0;
    const double *a = &p.x;
    const double *b = &p.y;
    printf("%g\n", *a);
    printf("%g\n", *b);
    return 0;
}
