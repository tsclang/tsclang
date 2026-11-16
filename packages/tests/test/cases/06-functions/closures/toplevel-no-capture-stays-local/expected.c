#include "runtime.h"

int main(void) {
    TSC_INIT();
    int32_t localOnly = 5;
    printf("%d\n", localOnly);
    return 0;
}
