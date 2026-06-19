#include "runtime.h"

int main(void) {
    TSC_INIT();
    int8_t x = 5;
    int8_t y = 3;
    int8_t a = x & y;
    printf("%d\n", (int)a);
    return 0;
}
