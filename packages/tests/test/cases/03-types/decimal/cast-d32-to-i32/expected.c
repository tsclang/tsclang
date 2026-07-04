#include "runtime.h"

int main(void) {
    TSC_INIT();
    d32_t d = 15000;
    int32_t i = (int32_t)(d / 10000);
    return 0;
}
