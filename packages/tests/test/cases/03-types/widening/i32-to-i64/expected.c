#include "runtime.h"

int main(void) {
    TSC_INIT();
    const int32_t a = 100;
    const int64_t b = a;
    printf("%lld\n", (long long)b);
    return 0;
}
