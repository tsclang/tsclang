#include "runtime.h"

int main(void) {
    TSC_INIT();
    printf("%s\n", (false || false) ? "true" : "false");
    return 0;
}
