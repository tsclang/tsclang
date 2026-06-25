#include "runtime.h"

int main(void) {
    TSC_INIT();
    int32_t x = 5;
    switch (x) {
        case 1:
            printf("one\n");
            break;
        default:
            printf("other\n");
    }
    return 0;
}
