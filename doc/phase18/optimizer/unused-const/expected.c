#include "runtime.h"

int main(void) {
    TSC_INIT();
    const int32_t USED = 7;
    printf("%d\n", USED);
    return 0;
}
