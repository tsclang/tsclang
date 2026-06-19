#include "runtime.h"

int main(void) {
    TSC_INIT();
    printf("%s\n", (4 == 2 + 2) ? "true" : "false");
    return 0;
}
