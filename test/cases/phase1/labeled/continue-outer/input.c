#include "runtime.h"

int main(void) {
    TSC_INIT();
    int32_t sum = 0;
    int32_t i = 0;
    while (i < 3) {
        int32_t j = 0;
        while (j < 3) {
            j++;
            if (j == 2) {
                goto outer_continue;
            }
            sum += 1;
        }
        i++;
        outer_continue:;
    }
    printf("%d\n", sum);
    return 0;
}
