#include "runtime.h"

typedef struct { int32_t _0; String _1; } tuple_i32_string;

tuple_i32_string getPair(void) {
    const tuple_i32_string result = {._0 = 42, ._1 = STR_LIT("hello")};
    return result;
}

int main(void) {
    TSC_INIT();
    const int32_t a = getPair()._0;
    const String b = getPair()._1;
    tsc_string_retain(b);
    printf("%d\n", a);
    printf("%s\n", b.data);
    return 0;
}
