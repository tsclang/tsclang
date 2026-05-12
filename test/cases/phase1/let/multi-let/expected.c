#include "runtime.h"

int main(void) {
    TSC_INIT();
    int32_t a = 10;
    int32_t b = 20;
    int32_t c = 30;
    printf("%d\n", a);
    printf("%d\n", b);
    printf("%d\n", c);
    return 0;
}
