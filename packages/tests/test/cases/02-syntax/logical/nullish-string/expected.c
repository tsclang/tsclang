#include "runtime.h"

int main(void) {
    TSC_INIT();
    opt_string x = {false, 0};
    String y = x.has_value ? x.value : STR_LIT("default");
    printf("%s\n", y.data);
    tsc_string_release(y);
    return 0;
}
