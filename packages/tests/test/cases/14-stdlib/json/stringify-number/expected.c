#include "runtime.h"

int main(void) {
    TSC_INIT();
    const int32_t n = 42;
    const String s = tsc_i32_to_string(n);
    printf("%s\n", s.data);
    tsc_string_release(s);
    return 0;
}
