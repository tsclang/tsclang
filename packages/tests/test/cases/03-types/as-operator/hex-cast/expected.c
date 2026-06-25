#include "runtime.h"

int main(void) {
    TSC_INIT();
    const int32_t a = 0xFF;
    const int64_t b = (int64_t)a;
    const uint8_t c = (uint8_t)0xFF;
    printf("%lld\n", (long long)b);
    printf("%u\n", (unsigned)c);
    return 0;
}
