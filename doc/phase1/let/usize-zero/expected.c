#include "runtime.h"

int main(void) {
    TSC_INIT();
    size_t x = 0U;
    printf("%zu\n", x);
    return 0;
}
