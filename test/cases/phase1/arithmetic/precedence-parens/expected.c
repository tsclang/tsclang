#include "runtime.h"

int main(void) {
    TSC_INIT();
    printf("%g\n", (2 + 3) * 4);
    return 0;
}
