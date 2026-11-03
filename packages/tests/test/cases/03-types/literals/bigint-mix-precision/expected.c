#include "runtime.h"

int main(void) {
    TSC_INIT();
    int64_t a = 9007199254770993LL + 1LL;
    printf("%lld\n", (long long)a);
    return 0;
}
