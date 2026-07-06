#include "runtime.h"

int main(void) {
    TSC_INIT();
    d64_t x = 150000000LL;
    printf("%s\n", tsc_d64_to_string(x).data);
    return 0;
}
