#include "runtime.h"

int main(void) {
    TSC_INIT();
    int32_t n = 7;
    int64_t big = 9007199254740993LL;
    String s = STR_LIT("android");
    printf("%d\n", n);
    printf("%lld\n", (long long)big);
    printf("%s\n", s.data);
    tsc_string_release(s);
    return 0;
}
