#include "runtime.h"

int main(void) {
    TSC_INIT();
    int32_t a = 0;
    int32_t b = 0;
    a = b = 5;
    printf("%d\n", a);
    return 0;
}
