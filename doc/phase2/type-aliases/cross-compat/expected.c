#include "runtime.h"

typedef struct { double x; double y; } Pt1;
typedef struct { double x; double y; } Pt2;

int main(void) {
    TSC_INIT();
    const Pt1 a = {.x = 1.0, .y = 2.0};
    const Pt2 b = *(const Pt2 *)&a;
    printf("%g\n", b.x);
    return 0;
}
