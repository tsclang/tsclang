#include "runtime.h"

typedef struct { double _0; double _1; double _2; } P;

int main(void) {
    TSC_INIT();
    const P p = {._0 = 1.0, ._1 = 2.0, ._2 = 3.0};
    const P copy = {._0 = p._0, ._1 = p._1, ._2 = p._2};
    printf("%g\n", copy._0);
    printf("%g\n", copy._2);
    return 0;
}
