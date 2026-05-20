#include "runtime.h"

int main(void) {
    TSC_INIT();
    int32_t total = 0;
    for (int32_t i = 0; i < 3; i++) {
        String s = STR_LIT("hello");
        for (int32_t j = 0; j < 3; j++) {
            String t = STR_LIT("world");
            if (i == 1 && j == 1) {
                tsc_string_release(t);
                tsc_string_release(s);
                goto outer_break;
            }
            tsc_string_release(t);
        }
        total = total + i;
        tsc_string_release(s);
    }
    outer_break:;
    printf("%d\n", total);
    return 0;
}
