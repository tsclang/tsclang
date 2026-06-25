#include "runtime.h"

int main(void) {
    TSC_INIT();
    const int32_t MAX = 100;
    printf("%d\n", MAX);
    return 0;
}
