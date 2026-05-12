#include "runtime.h"

int main(void) {
    TSC_INIT();
    printf("%g\n", -42.0);
    printf("%g\n", -3.14);
    return 0;
}
