#include "runtime.h"

int main(void) {
    TSC_INIT();
    const String s = STR_LIT("42");
    const int32_t n = atoi(s.data);
    printf("%d\n", n);
    return 0;
}
