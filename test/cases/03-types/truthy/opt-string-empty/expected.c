#include "runtime.h"

int main(void) {
    TSC_INIT();
    opt_string s = {true, STR_LIT("")};
    if (s.has_value && s.value.length > 0) {
        printf("yes\n");
    } else {
        printf("no\n");
    }
    return 0;
}
