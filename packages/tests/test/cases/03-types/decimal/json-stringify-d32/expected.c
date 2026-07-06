#include "runtime.h"

int main(void) {
    TSC_INIT();
    d32_t x = 25000;
    printf("%s\n", tsc_d32_to_string(x).data);
    return 0;
}
