#include "runtime.h"

int main(void) {
    TSC_INIT();
    int32_t i = 0;
    while (i < 3) {
        printf("%d\n", i);
        i++;
    }
    return 0;
}
