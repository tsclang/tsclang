#include "runtime.h"

int32_t add_i32_i32(int32_t a, int32_t b) {
    return a + b;
}

typedef struct { int32_t _0; int32_t _1; } tuple_i32_i32;

int main(void) {
    TSC_INIT();
    const tuple_i32_i32 args = {._0 = 3, ._1 = 4};
    printf("%d\n", args._0 + args._1);
    return 0;
}
