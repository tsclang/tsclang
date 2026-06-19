#include "runtime.h"

int main(void) {
    TSC_INIT();
    const int32_t x = (false) ? 10 : 20;
    printf("%d\n", x);
    return 0;
}
