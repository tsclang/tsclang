#include "runtime.h"

typedef struct { int32_t _0; int32_t _1; int32_t _2; } tuple_i32_i32_i32;

int main(void) {
    TSC_INIT();
    const tuple_i32_i32_i32 triple = {._0 = 1, ._1 = 2, ._2 = 3};
    const int32_t x = triple._0;
    const int32_t z = triple._2;
    printf("%d\n", x);
    printf("%d\n", z);
    return 0;
}
