#include "runtime.h"

int main(void) {
    TSC_INIT();
    printf("%s\n", (5 > 3) ? "true" : "false");
    return 0;
}
