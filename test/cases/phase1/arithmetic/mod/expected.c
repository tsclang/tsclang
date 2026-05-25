#include "runtime.h"

int main(void) {
    TSC_INIT();
    printf("%g\n", (double)(fmod(10, 3)));
    return 0;
}
