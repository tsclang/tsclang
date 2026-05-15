#include "runtime.h"

typedef struct { int32_t _0; String _1; } tuple_i32_string;

int main(void) {
    TSC_INIT();
    tuple_i32_string pair = {._0 = 1, ._1 = STR_LIT("hello")};
    String s = pair._1;
    tsc_string_retain(s);
    printf("%s\n", s.data);
    tsc_string_release(s);
    return 0;
}

