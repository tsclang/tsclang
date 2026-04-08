#include "runtime.h"

int main(void) {
    TSC_INIT();
    int64_t x = 0LL;
    printf("%lld\n", (long long)x);
    return 0;
}
