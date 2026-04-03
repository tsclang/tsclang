#include "runtime.h"

int main(void) {
    TSC_INIT();
    int8_t x = 127;
    printf("%d\n", x);
    return 0;
}
