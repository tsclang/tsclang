#include "runtime.h"
#include <math.h>

int main(void) {
    TSC_INIT();
    printf("%d\n", (int32_t)((int32_t)(3) * (int32_t)(4)));
    return 0;
}
