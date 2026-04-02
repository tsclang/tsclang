#include "runtime.h"

int main(void) {
    TSC_INIT();
    int32_t x = 10;
    {
        int32_t *ptr = &x;
        printf("%d\n", *ptr);
    }
    return 0;
}
