#include "runtime.h"

int main(void) {
    TSC_INIT();
    bool x = false;
    printf("%s\n", (x) ? "true" : "false");
    return 0;
}
