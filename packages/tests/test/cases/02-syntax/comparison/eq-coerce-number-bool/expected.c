#include "runtime.h"

int main(void) {
    TSC_INIT();
    printf("%s\n", (((double)(1) == (true ? 1.0 : 0.0))) ? "true" : "false");
    printf("%s\n", (((double)(0) == (false ? 1.0 : 0.0))) ? "true" : "false");
    printf("%s\n", (((double)(2) == (true ? 1.0 : 0.0))) ? "true" : "false");
    return 0;
}
