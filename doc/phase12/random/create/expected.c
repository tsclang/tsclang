#include "runtime.h"
#include "std/random.h"

int main(void) {
    TSC_INIT();
    TscRandom r = tsc_random_create(42);
    int32_t x = tsc_random_next_i32(&r);
    printf("%s\n", "i32");
    return 0;
}
