#include "runtime.h"

typedef struct { int32_t _0; int32_t *_tail; int32_t _tail_len; } Row;

int main(void) {
    TSC_INIT();
    int32_t _tail_0[] = {20, 30, 40};
    Row r = {._0 = 10, ._tail = _tail_0, ._tail_len = 3};
    printf("%d\n", r._0);
    return 0;
}
