#include "runtime.h"

int main(void) {
    TSC_INIT();
    const int8_t a = 127;
    const int8_t b = -128;
    const uint8_t c = 255U;
    const int16_t d = 32767;
    const uint16_t e = 65535U;
    const int32_t f = 2147483647;
    const uint32_t g = 4294967295U;
    const int64_t h = 9223372036854775807LL;
    printf("%d %d %u %d %u %d %u %lld\n", (int)a, (int)b, (unsigned)c, (int)d, (unsigned)e, f, g, (long long)h);
    return 0;
}
