#include "runtime.h"

typedef struct { const int32_t _0; const String _1; } readonly_tuple_i32_string;

int main(void) {
    TSC_INIT();
    readonly_tuple_i32_string t = {._0 = 1, ._1 = STR_LIT("x")};
    return 0;
}
