#include "runtime.h"

int main(void) {
    TSC_INIT();
    printf("count: %s\n", tsc_dtoa(3.0));
    return 0;
}
