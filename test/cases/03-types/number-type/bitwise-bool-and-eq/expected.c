#include "runtime.h"

int main(void) {
    TSC_INIT();
    bool a = true;
    bool b = false;
    a &= b;
    printf("%s\n", (a) ? "true" : "false");
    return 0;
}
