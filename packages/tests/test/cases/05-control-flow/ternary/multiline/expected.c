#include "runtime.h"

int32_t run_bool(bool flag) {
    const int32_t x = (flag) ? 1 : 0;
    return x;
}

int main(void) {
    TSC_INIT();
    return 0;
}
