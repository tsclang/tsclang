#include "runtime.h"

static const int32_t MAX = 100;

int main(void) {
    TSC_INIT();
    printf("%d\n", MAX);
    return 0;
}
