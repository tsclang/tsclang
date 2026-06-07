#include "runtime.h"

int main(void) {
    TSC_INIT();
    int32_t x = 1;
    switch (x) {
        case 1:
            printf("%g\n", 1.0);
            break;
        case 2:
            printf("%g\n", 2.0);
            break;
        default: break;
    }
    return 0;
}
