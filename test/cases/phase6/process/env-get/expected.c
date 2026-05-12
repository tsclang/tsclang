#include "runtime.h"
#include <stdlib.h>

int main(void) {
    TSC_INIT();
    opt_String val = tsc_env_get(STR_LIT("PATH"));
    if (val.has_value) {
        printf("has PATH\n");
    } else {
        printf("no PATH\n");
    }
    return 0;
}

