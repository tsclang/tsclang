#include "runtime.h"

int main(void) {
    TSC_INIT();
    int32_t x = 1;
    switch (x) {
        case 1:
        case 2:
            printf("one-or-two\n");
            break;
        default:
            printf("other\n");
    }
    return 0;
}
