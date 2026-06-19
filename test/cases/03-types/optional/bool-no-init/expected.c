#include "runtime.h"

int main(void) {
    TSC_INIT();
    bool b = false;
    printf("%s\n", (b) ? "true" : "false");
    return 0;
}
