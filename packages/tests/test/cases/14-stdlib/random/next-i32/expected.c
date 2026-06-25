#include "runtime.h"

int main(void) {
    TSC_INIT();
    TscRandom rng = tsc_random_seed(42);
    const int32_t v = tsc_random_next_i32(&rng);
    printf("i32\n");
    return 0;
}
