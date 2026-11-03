#include "runtime.h"

int main(void) {
    TSC_INIT();
    int64_t a = 42LL;
    printf("%lld\n", (long long)a);
    return 0;
}
