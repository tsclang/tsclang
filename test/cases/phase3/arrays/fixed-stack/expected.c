#include "runtime.h"

int main(void) {
    TSC_INIT();
    int32_t arr[3] = {10, 20, 30};
    printf("%d\n", arr[0]);
    printf("%d\n", arr[2]);
    return 0;
}
