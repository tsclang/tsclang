#include "runtime.h"

int32_t third(int32_t *_arr) {
    int32_t c = _arr[2];
    return c;
}

int main(void) {
    TSC_INIT();
    int32_t arr[] = {1, 2, 7};
    printf("%d\n", third(arr));
    return 0;
}
