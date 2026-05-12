#include "runtime.h"

int main(void) {
    TSC_INIT();
    int32_t i = 0;
    do {
        printf("%d\n", i);
        i++;
    } while (i < 3);
    return 0;
}
