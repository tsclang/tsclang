#include "runtime.h"

int main(void) {
    TSC_INIT();
    opt_string s = {false, 0};
    if (s.has_value && s.value.length > 0) {
        printf("yes\n");
    } else {
        printf("no\n");
    }
    return 0;
}
