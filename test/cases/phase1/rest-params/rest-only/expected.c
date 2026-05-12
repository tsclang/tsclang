#include "runtime.h"

int32_t sum(int32_t *args, int32_t args_count) {
    int32_t total = 0;
    for (int32_t i = 0; i < args_count; i++) {
        total = total + args[i];
    }
    return total;
}

int main(void) {
    TSC_INIT();
    int32_t _rest_0[] = {1, 2, 3};
    printf("%d\n", sum(_rest_0, 3));
    return 0;
}
