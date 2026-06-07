#include "runtime.h"

int main(void) {
    TSC_INIT();
    char c = 97U;
    int32_t x = 3;
    c &= x;
    printf("%c\n", c);
    return 0;
}
