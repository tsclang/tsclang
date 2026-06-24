#include "runtime.h"

int32_t double_i32(int32_t x) {
    return x * 2;
}

int main(void) {
    TSC_INIT();
    const int32_t v = 2;
    int32_t _match_0 = {0};
    if (v == 1) { _match_0 = 10; }
    else if (v == 2) { _match_0 = 20; }
    else { _match_0 = 0; }
    printf("%d\n", double_i32(_match_0));
    return 0;
}
