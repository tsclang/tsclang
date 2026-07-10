#include "runtime.h"

void run(void) {
    int32_t x = 42;
    {
        x = x + 1;
    }
    printf("%d\n", x);
}

int main(void) {
    TSC_INIT();
    return 0;
}
