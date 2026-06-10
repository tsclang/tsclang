#include "runtime.h"

int32_t leaf(void) {
    int32_t a = 1;
    int32_t b = 2;
    return a + b;
}

int32_t mid(void) {
    int32_t x = 3;
    return x + leaf();
}

int32_t top(void) {
    int32_t y = 4;
    return y + mid();
}

int main(void) {
    TSC_INIT();
    return 0;
}
