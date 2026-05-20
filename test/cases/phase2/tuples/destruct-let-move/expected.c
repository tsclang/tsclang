#include "runtime.h"

typedef struct { int32_t _0; String _1; } tuple_i32_string;

int main(void) {
    TSC_INIT();
    tuple_i32_string pair = {._0 = 1, ._1 = STR_LIT("hello")};
    int32_t a = pair._0;
    String b = pair._1;
    tsc_string_retain(b);
    memset(&pair._1, 0, sizeof(String));
    printf("%d\n", a);
    printf("%s\n", b.data);
    return 0;
}
