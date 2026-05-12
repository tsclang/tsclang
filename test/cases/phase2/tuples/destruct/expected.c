#include "runtime.h"

typedef struct { int32_t _0; String _1; } tuple_i32_string;

int main(void) {
    TSC_INIT();
    const tuple_i32_string pair = {._0 = 42, ._1 = STR_LIT("answer")};
    const int32_t a = pair._0;
    const String b = pair._1;
    printf("%d\n", a);
    printf("%s\n", b.data);
    return 0;
}
