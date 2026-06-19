#include "runtime.h"

int main(void) {
    TSC_INIT();
    const size_t n = 42U;
    printf("%zu\n", n);
    return 0;
}
