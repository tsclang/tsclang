#include "runtime.h"

typedef struct { double _0; double _1; } Point;

int main(void) {
    TSC_INIT();
    const Point p = {._0 = 3.0, ._1 = 4.0};
    printf("%g\n", p._0);
    printf("%g\n", p._0);
    return 0;
}
