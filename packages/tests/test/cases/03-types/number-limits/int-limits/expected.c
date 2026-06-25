#include "runtime.h"

int main(void) {
    TSC_INIT();
    const int8_t a = INT8_MAX;
    const int8_t b = INT8_MIN;
    const int16_t c = INT16_MAX;
    const int16_t d = INT16_MIN;
    const int32_t e = INT32_MAX;
    const int32_t f = INT32_MIN;
    const int64_t g = INT64_MAX;
    const int64_t h = INT64_MIN;
    const uint8_t i = UINT8_MAX;
    const uint16_t j = UINT16_MAX;
    const uint32_t k = UINT32_MAX;
    const uint64_t l = UINT64_MAX;
    const int64_t safeMax = 9007199254740991LL;
    const int64_t safeMin = (-9007199254740991LL);
    printf("%d %d\n", (int)a, (int)b);
    printf("%d %d\n", (int)c, (int)d);
    printf("%d %d\n", e, f);
    printf("%lld %lld\n", (long long)g, (long long)h);
    printf("%u %u\n", (unsigned)i, (unsigned)j);
    printf("%u %llu\n", k, (unsigned long long)l);
    printf("%lld\n", (long long)safeMax);
    printf("%lld\n", (long long)safeMin);
    return 0;
}
