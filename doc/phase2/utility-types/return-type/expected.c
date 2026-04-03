#include "runtime.h"

int32_t getAge(void) {
    return 42;
}

int main(void) {
    TSC_INIT();
    const int32_t x = 10;
    printf("%d\n", x);
    return 0;
}
