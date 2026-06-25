#include "runtime.h"

int main(void) {
    TSC_INIT();
    bool x = true;
    printf("%s\n", (x) ? "true" : "false");
    return 0;
}
