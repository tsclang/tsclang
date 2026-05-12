#include "runtime.h"

typedef struct { int32_t _0; String _1; } tuple_i32_string;

int main(void) {
    TSC_INIT();
    tuple_i32_string pair = {._0 = 1, ._1 = STR_LIT("hello")};
    printf("%d\n", pair._0);
    printf("%s\n", pair._1.data);
    return 0;
}
