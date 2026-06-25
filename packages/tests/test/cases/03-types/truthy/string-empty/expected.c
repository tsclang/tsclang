#include "runtime.h"

int main(void) {
    TSC_INIT();
    String s = STR_LIT("");
    if (s.length > 0) {
        printf("yes\n");
    } else {
        printf("no\n");
    }
    tsc_string_release(s);
    return 0;
}
