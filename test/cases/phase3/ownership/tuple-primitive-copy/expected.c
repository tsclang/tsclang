#include "runtime.h"

typedef struct { int32_t _0; double _1; } tuple_i32_f64;

int main(void) {
    TSC_INIT();
    tuple_i32_f64 pair = {._0 = 1, ._1 = 2.0};
    tuple_i32_f64 b = pair;
    printf("%d\n", b._0);
    printf("%g\n", (double)(b._1));
    printf("%d\n", pair._0);
    return 0;
}
