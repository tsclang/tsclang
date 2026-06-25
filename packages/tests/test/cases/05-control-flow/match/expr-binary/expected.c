#include "runtime.h"

int main(void) {
    TSC_INIT();
    const int32_t v = 2;
    int32_t _match_0 = {0};
    if (v == 1) { _match_0 = 10; }
    else if (v == 2) { _match_0 = 20; }
    else { _match_0 = 0; }
    const int32_t result = 1 + _match_0;
    printf("%d\n", result);
    return 0;
}
