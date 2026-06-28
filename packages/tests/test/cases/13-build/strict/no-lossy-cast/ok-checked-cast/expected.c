#include "runtime.h"

typedef struct { bool has_value; int32_t value; } opt_i32;

int main(void) {
    TSC_INIT();
    int64_t big = 5000000000LL;
    opt_i32 _checked_0;
    _checked_0.has_value = (big >= (INT32_MIN) && big <= (INT32_MAX));
    _checked_0.value = _checked_0.has_value ? (int32_t)(big) : (int32_t)0;
    opt_i32 result = _checked_0;
    if (!result.has_value) {
        printf("overflow\n");
    } else {
        printf("%d\n", result.value);
    }
    return 0;
}
