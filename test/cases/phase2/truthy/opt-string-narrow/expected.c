#include "runtime.h"

int main(void) {
    TSC_INIT();
    opt_string s = {true, STR_LIT("hello")};
    if (s.has_value && s.value.length > 0) {
        printf("%s\n", s.value.data);
    }
    return 0;
}
