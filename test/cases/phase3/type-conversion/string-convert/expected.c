#include "runtime.h"

int main(void) {
    TSC_INIT();
    String s = tsc_i32_to_string(42);
    printf("%s\n", s.data);
    tsc_string_release(s);
    return 0;
}
