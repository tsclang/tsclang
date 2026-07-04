#include "runtime.h"

int main(void) {
    TSC_INIT();
    d64_t a = -350000000LL;
    d64_t b = (d64_t)llabs(a);
    return 0;
}
