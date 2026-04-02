#include "runtime.h"

int main(void) {
    TSC_INIT();
    printf("%s
", (5 > 3) ? "true" : "false");
    return 0;
}
