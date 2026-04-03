#include "runtime.h"

int main(void) {
    TSC_INIT();
    printf("%s\n", (3 < 5) ? "true" : "false");
    return 0;
}
