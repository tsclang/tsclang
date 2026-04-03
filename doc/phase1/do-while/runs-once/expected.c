#include "runtime.h"

int main(void) {
    TSC_INIT();
    int32_t x = 0;
    do {
        printf("ran\n");
        x++;
    } while (false);
    return 0;
}
