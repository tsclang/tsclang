#include "runtime.h"

int main(void) {
    TSC_INIT();
    int32_t n = tsc_i32_parse(STR_LIT("42"));
    printf("%d\n", n);
    return 0;
}
