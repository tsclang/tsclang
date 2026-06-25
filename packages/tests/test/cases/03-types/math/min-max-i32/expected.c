#include "runtime.h"

int main(void) {
    TSC_INIT();
    const int32_t a = 3;
    const int32_t b = 1;
    const int32_t c = 7;
    int32_t _min_0 = a;
    if (b < _min_0) _min_0 = b;
    if (c < _min_0) _min_0 = c;
    printf("%d\n", _min_0);
    int32_t _max_1 = a;
    if (b > _max_1) _max_1 = b;
    if (c > _max_1) _max_1 = c;
    printf("%d\n", _max_1);
    return 0;
}
