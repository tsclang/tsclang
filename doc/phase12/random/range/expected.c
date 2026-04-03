#include "runtime.h"

typedef struct { uint64_t state; } TscRandom;

int main(void) {
    TSC_INIT();
    TscRandom rng = tsc_random_seed(1);
    const int32_t v = tsc_random_range_i32(&rng, 1, 6);
    printf("%s\n", (v >= 1 && v <= 6) ? "true" : "false");
    return 0;
}
