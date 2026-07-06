#include "runtime.h"

int main(void) {
    TSC_INIT();
    d32_t a = 15000;
    String s = tsc_string_format("val=%s", tsc_dec_dtoa((int64_t)(a), 10000, 4));
    tsc_string_release(s);
    return 0;
}
