#include "runtime.h"

int main(void) {
    TSC_INIT();
    int32_t i = 0;
    while (i < 2) {
        int32_t j = 0;
        while (j < 2) {
            printf("%d %d\n", i, j);
            j++;
        }
        i++;
    }
    return 0;
}
