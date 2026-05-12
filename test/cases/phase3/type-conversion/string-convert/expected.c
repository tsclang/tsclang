#include "runtime.h"

int main(void) {
    TSC_INIT();
    String s = tsc_i32_to_string(42);
    printf("%s\n", s.data);
    tsc_string_free(s);
    return 0;
}
