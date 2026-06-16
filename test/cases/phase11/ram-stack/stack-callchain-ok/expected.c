#include "runtime.h"

int32_t leaf(void) {
    int32_t a = 1;
    int32_t b = 2;
    return (int32_t)((uint32_t)a + (uint32_t)b);
}

int32_t mid(void) {
    int32_t x = 3;
    return (int32_t)((uint32_t)x + (uint32_t)leaf());
}

int32_t top(void) {
    int32_t y = 4;
    return (int32_t)((uint32_t)y + (uint32_t)mid());
}

int main(void) {
    TSC_INIT();
    return 0;
}
