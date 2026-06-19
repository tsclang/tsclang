#include "runtime.h"

int main(void) {
    TSC_INIT();
    bool a = true & true;
    bool b = true & false;
    printf("%s\n", (a) ? "true" : "false");
    printf("%s\n", (b) ? "true" : "false");
    return 0;
}
