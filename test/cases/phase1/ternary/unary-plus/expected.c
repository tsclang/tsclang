#include "runtime.h"

int main(void) {
    TSC_INIT();
    const int32_t a = 5;
    const int32_t x = (true) ? +a : 0;
    printf("%d\n", x);
    return 0;
}
