#include "runtime.h"

int main(void) {
    TSC_INIT();
    int32_t total = 0;
    for (int32_t i = 0; i < 5; i++) {
        String s = STR_LIT("hello");
        if (i == 2) {
            tsc_string_release(s);
            break;
        }
        total = (int32_t)((uint32_t)total + (uint32_t)i);
        tsc_string_release(s);
    }
    printf("%d\n", total);
    return 0;
}
