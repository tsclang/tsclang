#include "runtime.h"

static const int32_t constants_MAX = 100;

static const int32_t constants_MIN = 0;

int main(void) {
    TSC_INIT();
    printf("%d\n", constants_MAX);
    printf("%d\n", constants_MIN);
    return 0;
}
