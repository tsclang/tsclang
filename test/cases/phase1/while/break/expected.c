#include "runtime.h"

int main(void) {
    TSC_INIT();
    int32_t i = 0;
    while (true) {
        if (i == 2) {
            break;
        }
        printf("%d\n", i);
        i++;
    }
    return 0;
}
