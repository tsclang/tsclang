#include "runtime.h"

static int32_t count = 0;

static void inc(void) {
    count = count + 1;
}

int main(void) {
    TSC_INIT();
    inc();
    inc();
    printf("%d\n", count);
    return 0;
}
