#include "runtime.h"

typedef struct { double _0; double _1; } Pair;
typedef struct { double _0; double _1; double _2; } Triple;

int main(void) {
    TSC_INIT();
    const Pair pair = {._0 = 3.0, ._1 = 4.0};
    const Triple triple = {._0 = pair._0, ._1 = pair._1, ._2 = 5.0};
    printf("%g\n", triple._2);
    return 0;
}
