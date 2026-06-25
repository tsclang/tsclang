#include "runtime.h"

typedef struct { double x; double y; } Pt1;
typedef struct { double x; double y; } Pt2;

int main(void) {
    TSC_INIT();
    Pt1 a = { .x = 1.0, .y = 2.0 };
    Pt2 b = *(Pt2 *)&a;
    printf("%s\n", tsc_dtoa((double)(b.x)));
    return 0;
}
