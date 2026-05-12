#include "runtime.h"

int main(void) {
    TSC_INIT();
    TscRandom r = tsc_random_seed(42);
    const int32_t x = tsc_random_next_i32(&r);
    printf("i32\n");
    return 0;
}
