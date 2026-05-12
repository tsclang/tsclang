#include "runtime.h"

typedef int32_t UserId;

int main(void) {
    TSC_INIT();
    const UserId id = 42;
    const int32_t n = id;
    printf("%d\n", n);
    return 0;
}
