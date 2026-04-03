#include "runtime.h"

int main(void) {
    TSC_INIT();
    printf("%s\n", (5 == 6) ? "true" : "false");
    return 0;
}
