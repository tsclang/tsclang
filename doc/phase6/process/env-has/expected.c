#include "runtime.h"
#include <stdlib.h>

int main(void) {
    TSC_INIT();
    const bool haspath = tsc_env_has(STR_LIT("PATH"));
    printf("%s\n", (haspath) ? "true" : "false");
    return 0;
}

