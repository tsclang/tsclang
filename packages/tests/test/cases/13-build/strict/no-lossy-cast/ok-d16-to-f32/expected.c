#include "runtime.h"

int main(void) {
    TSC_INIT();
    d16_t x = 32767;
    float y = (float)(x / 100.0);
    return 0;
}
