#include "runtime.h"

int main(void) {
    TSC_INIT();
    int32_t sum = 0;
    for (int32_t i = (true) ? 0 : 5; i < 10; i++) {
        sum = (int32_t)((uint32_t)sum + (uint32_t)i);
    }
    printf("%d\n", sum);
    return 0;
}
