#include "runtime.h"

typedef struct { uint64_t state; } TscRandom;

int main(void) {
    TSC_INIT();
    TscRandom r1 = tsc_random_seed(123);
    TscRandom r2 = tsc_random_seed(123);
    printf("%s\n", (tsc_random_next_i32(&r1) == tsc_random_next_i32(&r2)) ? "true" : "false");
    return 0;
}
