#include "runtime.h"

typedef struct { uint64_t state; } TscRandom;

int main(void) {
    TSC_INIT();
    TscRandom rng = tsc_random_seed(0);
    const double v = tsc_random_next_f64(&rng);
    printf("%s\n", (v >= 0.0 && v < 1.0) ? "true" : "false");
    return 0;
}
