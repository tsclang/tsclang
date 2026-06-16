#include "runtime.h"

typedef struct { bool has_value; int32_t value; } opt_i32;

int main(void) {
    TSC_INIT();
    opt_i32 x = {true, 3};
    int32_t sum = 0;
    int32_t i = 0;
    while (i < 3) {
        if (x.has_value && x.value != 0) {
            sum = (int32_t)((uint32_t)sum + (uint32_t)x.value);
        }
        i = i + 1;
    }
    printf("%d\n", sum);
    return 0;
}
