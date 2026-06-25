#include "runtime.h"

int main(void) {
    TSC_INIT();
    int16_t x = -32768;
    printf("%d\n", (int)x);
    return 0;
}
