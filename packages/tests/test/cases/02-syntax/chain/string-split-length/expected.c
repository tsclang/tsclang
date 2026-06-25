#include "runtime.h"

int main(void) {
    TSC_INIT();
    const String s = STR_LIT("hello world");
    printf("%zu\n", tsc_string_split_expr(s, STR_LIT(" ")).length);
    tsc_string_release(s);
    return 0;
}
