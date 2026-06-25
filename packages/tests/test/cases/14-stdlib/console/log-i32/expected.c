#include "runtime.h"

int main(void) {
    TSC_INIT();
    printf("%s\n", tsc_dtoa(42.0));
    return 0;
}
