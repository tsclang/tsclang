#include "runtime.h"

int main(void) {
    TSC_INIT();
    int32_t a[] = {1, 2};
    int32_t b[] = {3, 4};
    int32_t c[] = {a[0], a[1], b[0], b[1]};
    printf("%d\n", c[0]);
    printf("%d\n", c[1]);
    printf("%d\n", c[2]);
    printf("%d\n", c[3]);
    return 0;
}
