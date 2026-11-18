#include "runtime.h"

int main(void) {
    TSC_INIT();
    const int32_t n = 7;
    String s = tsc_string_format("n=A%d!", n);
    printf("%s\n", s.data);
    printf("%zu\n", s.length);
    tsc_string_release(s);
    return 0;
}
