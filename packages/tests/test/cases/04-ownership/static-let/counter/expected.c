#include "runtime.h"

static int32_t counter = 0;

void increment(void) {
    counter++;
}

int main(void) {
    TSC_INIT();
    increment();
    increment();
    increment();
    printf("%d\n", counter);
    return 0;
}
