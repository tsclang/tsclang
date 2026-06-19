#include "runtime.h"

int main(void) {
    TSC_INIT();
    int32_t x = 2;
    if (x == 1) {
        printf("one\n");
    } else if (x == 2) {
        printf("two\n");
    } else {
        printf("other\n");
    }
    return 0;
}
