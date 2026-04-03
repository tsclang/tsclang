#include "runtime.h"

int main(void) {
    TSC_INIT();
    int32_t i = 0;
    while (i < 4) {
        i++;
        if (i == 2) {
            continue;
        }
        printf("%d\n", i);
    }
    return 0;
}
