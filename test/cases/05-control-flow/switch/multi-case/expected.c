#include "runtime.h"

int main(void) {
    TSC_INIT();
    int32_t x = 2;
    switch (x) {
        case 1:
            printf("one\n");
            break;
        case 2:
            printf("two\n");
            break;
        case 3:
            printf("three\n");
            break;
        default:
            printf("other\n");
    }
    return 0;
}
