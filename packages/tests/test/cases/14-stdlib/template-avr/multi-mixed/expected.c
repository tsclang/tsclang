#include "runtime.h"

int main(void) {
    TSC_INIT();
    int32_t x = 7;
    int32_t y = 42;
    String s = tsc_string_format("x=%ld y=%ld", (long)x, (long)y);
    tsc_print_str(s);
    printf("\n");
    tsc_string_release(s);
    return 0;
}
