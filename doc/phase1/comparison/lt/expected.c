#include "runtime.h"

int main(void) {
    TSC_INIT();
    printf("%s
", (3 < 5) ? "true" : "false");
    return 0;
}
