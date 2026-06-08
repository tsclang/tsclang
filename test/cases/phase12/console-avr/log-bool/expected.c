#include "runtime.h"

int main(void) {
    TSC_INIT();
    bool b = true;
    printf("%s\n", (b) ? "true" : "false");
    return 0;
}
