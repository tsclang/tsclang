#include "runtime.h"

int main(void) {
    TSC_INIT();
    d32_t a = 25000;
    String s = tsc_d32_to_string(a);
    printf("%s\n", s.data);
    tsc_string_release(s);
    return 0;
}
