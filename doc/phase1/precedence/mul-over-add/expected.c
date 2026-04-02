#include "runtime.h"

int main(void) {
    TSC_INIT();
    printf("%s\n", (2 + 3 * 4 == 14) ? "true" : "false");
    return 0;
}
