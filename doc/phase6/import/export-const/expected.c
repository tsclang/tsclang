#include "runtime.h"

static const int32_t MAX = 100;

static const int32_t MIN = 0;

int main(void) {
    TSC_INIT();
    printf("%d\n", MAX);
    printf("%d\n", MIN);
    return 0;
}
