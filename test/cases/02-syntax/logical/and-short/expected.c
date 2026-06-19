#include "runtime.h"

int main(void) {
    TSC_INIT();
    int32_t x = 0;
    const bool r = false && (x = 1);
    printf("%d\n", x);
    return 0;
}
