#include "runtime.h"

typedef struct { int32_t _0; String _1; } tuple_i32_string;

int main(void) {
    TSC_INIT();
    const tuple_i32_string pair = {._0 = 1, ._1 = STR_LIT("one")};
    String desc;
    if (pair._0 == 1) { desc = STR_LIT("starts with one"); }
    else if (pair._0 == 2) { desc = STR_LIT("starts with two"); }
    else { desc = STR_LIT("other"); }
    printf("%s\n", desc.data);
    return 0;
}
