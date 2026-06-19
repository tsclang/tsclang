#include "runtime.h"

int main(void) {
    TSC_INIT();
    printf("%g\n", (double)((2 + 3) * 4));
    return 0;
}
