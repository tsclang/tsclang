#include "runtime.h"

int main(void) {
    TSC_INIT();
    const ptrdiff_t a = 4294967295;
    const ptrdiff_t b = -4294967296;
    printf("%lld\n", (long long)a);
    printf("%lld\n", (long long)b);
    return 0;
}
