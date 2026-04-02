#include "runtime.h"

int32_t sumPair(int32_t *_arr) {
    int32_t a = _arr[0];
    int32_t b = _arr[1];
    return a + b;
}

int main(void) {
    TSC_INIT();
    int32_t arr[] = {3, 4};
    printf("%d\n", sumPair(arr));
    return 0;
}
