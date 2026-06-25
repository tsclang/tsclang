#include "runtime.h"

int main(void) {
    TSC_INIT();
    const int32_t a = 2000000000;
    const int64_t b = (int64_t)a;
    printf("%lld\n", (long long)b);
    return 0;
}
